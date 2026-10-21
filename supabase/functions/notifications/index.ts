import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function respond(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

Deno.serve(async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return respond({ error: 'Método no permitido.' }, 405);

    try {
        const authorization = request.headers.get('Authorization');
        if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Inicia sesión para continuar.' }, 401);

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !anonKey || !serviceRoleKey) {
            throw new Error('Falta la configuración de Supabase para la función notifications.');
        }

        const userClient = createClient(supabaseUrl, anonKey);
        const token = authorization.slice('Bearer '.length);
        const { data: { user }, error: authError } = await userClient.auth.getUser(token);
        if (authError || !user) return respond({ error: 'La sesión no es válida.' }, 401);

        const admin = createClient(supabaseUrl, serviceRoleKey);
        const payload = await request.json();
        if (payload.action === 'message') {
            if (typeof payload.messageId !== 'string') return respond({ error: 'Falta el identificador del mensaje.' }, 400);
            const { data: message, error: messageError } = await admin.from('messages')
                .select('id,conversation_id,sender_id')
                .eq('id', payload.messageId)
                .single();
            if (messageError) throw messageError;
            if (message.sender_id !== user.id) return respond({ error: 'No puedes notificar un mensaje de otra persona.' }, 403);

            const { data: members, error: membersError } = await admin.from('conversation_members')
                .select('user_id')
                .eq('conversation_id', message.conversation_id)
                .neq('user_id', user.id);
            if (membersError) throw membersError;
            const recipientIds = (members || []).map(member => member.user_id);
            const senderName = user.user_metadata?.display_name || 'Nuevo mensaje';
            const result = await deliverPushes(admin, recipientIds, {
                title: senderName,
                body: 'Tienes un mensaje nuevo.',
                data: { url: `./?view=mensajes&conversation=${encodeURIComponent(message.conversation_id)}` }
            });
            return respond(result);
        }

        if (payload.action === 'announcement') {
            const adminEmail = Deno.env.get('ANNOUNCEMENT_ADMIN_EMAIL')?.trim().toLowerCase();
            if (!adminEmail || user.email?.toLowerCase() !== adminEmail) {
                return respond({ error: 'Esta cuenta no está autorizada para publicar anuncios.' }, 403);
            }
            const title = typeof payload.title === 'string' ? payload.title.trim() : '';
            const body = typeof payload.body === 'string' ? payload.body.trim() : '';
            if (!title || title.length > 120 || !body || body.length > 2000) {
                return respond({ error: 'El título debe tener hasta 120 caracteres y el mensaje hasta 2000.' }, 400);
            }

            const { data: subscriptions, error: subscriptionsError } = await admin
                .from('push_subscriptions')
                .select('user_id,endpoint,subscription');
            if (subscriptionsError) throw subscriptionsError;
            const { data: announcement, error: insertError } = await admin.from('announcements')
                .insert({ title, body, author_id: user.id })
                .select('id,title,body,author_id,created_at')
                .single();
            if (insertError) throw insertError;

            const result = await deliverSubscriptions(admin, subscriptions || [], {
                title: `Anuncio: ${title}`,
                body: body.slice(0, 180),
                data: { url: './?view=anuncios' }
            });
            return respond({ announcement, ...result });
        }

        return respond({ error: 'Acción no reconocida.' }, 400);
    } catch (error) {
        console.error('Error en la función notifications:', error);
        return respond({ error: error instanceof Error ? error.message : 'Error interno al procesar la notificación.' }, 500);
    }
});

async function deliverPushes(
    admin: ReturnType<typeof createClient>,
    userIds: string[],
    notification: { title: string; body: string; data: { url: string } }
) {
    const uniqueUserIds = [...new Set(userIds)];
    if (!uniqueUserIds.length) return { sent: 0, failed: 0 };

    const { data: subscriptions, error } = await admin.from('push_subscriptions')
        .select('endpoint,subscription')
        .in('user_id', uniqueUserIds);
    if (error) throw error;
    if (!subscriptions?.length) return { sent: 0, failed: 0 };

    return deliverSubscriptions(subscriptions, notification);
}

async function deliverSubscriptions(
    admin: ReturnType<typeof createClient>,
    subscriptions: Array<{ endpoint: string; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }>,
    notification: { title: string; body: string; data: { url: string } }
) {
    if (!subscriptions.length) return { sent: 0, failed: 0 };
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const subject = Deno.env.get('VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject) {
        return { sent: 0, failed: 0, warning: 'Falta configurar las claves VAPID; no se enviaron notificaciones push.' };
    }
    try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
    } catch (error) {
        console.error('Las claves VAPID no son válidas:', error);
        return {
            sent: 0,
            failed: subscriptions.length,
            warning: 'Las claves VAPID no son válidas; revisa su configuración.'
        };
    }
    const message = JSON.stringify(notification);
    let sent = 0;
    let failed = 0;
    for (let index = 0; index < subscriptions.length; index += 40) {
        const batch = subscriptions.slice(index, index + 40);
        const results = await Promise.all(batch.map(async item => {
            if (!isAllowedPushEndpoint(item.endpoint)) {
                console.error('Se rechazó una suscripción push con un dominio no permitido.');
                return false;
            }
            try {
                await webpush.sendNotification(item.subscription, message);
                return true;
            } catch (error) {
                const statusCode = (error as { statusCode?: number }).statusCode;
                if (statusCode === 404 || statusCode === 410) {
                    const { error: deleteError } = await admin.from('push_subscriptions')
                        .delete()
                        .eq('endpoint', item.endpoint);
                    if (deleteError) console.error('No se pudo borrar una suscripción push vencida:', deleteError);
                }
                console.error('Falló la entrega de una notificación push:', error);
                return false;
            }
        }));
        sent += results.filter(Boolean).length;
        failed += results.length - results.filter(Boolean).length;
    }
    return { sent, failed };
}

function isAllowedPushEndpoint(endpoint: string) {
    try {
        const url = new URL(endpoint);
        const hostname = url.hostname.toLowerCase();
        return url.protocol === 'https:'
            && !url.username
            && !url.password
            && (hostname === 'fcm.googleapis.com'
                || hostname === 'web.push.apple.com'
                || hostname === 'push.services.mozilla.com'
                || hostname.endsWith('.push.services.mozilla.com')
                || hostname === 'notify.windows.com'
                || hostname.endsWith('.notify.windows.com'));
    } catch {
        return false;
    }
}
