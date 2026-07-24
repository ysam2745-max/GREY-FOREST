import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { closeTicket } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("close") // اسم الأمر الرئيسي يفضل تركه بالإنجليزية لتسهيل كتابته السريعة بالـ /
        .setDescription("إغلاق التذكرة الحالية.")
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName("السبب") // تعريب اسم خيار سبب الإغلاق
                .setDescription("سبب إغلاق التذكرة (اختياري).")
                .setRequired(false),
        ),

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'يمكنك استخدام هذا الأمر داخل رومات التذاكر الصالحة فقط.' });
        }

        if (!permissionContext.canCloseTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'تحتاج إلى صلاحية `إدارة القنوات`، أو رتبة `الدعم الفني` المحددة، أو أن تكون صاحب التذكرة لإغلاقها.' });
        }

        // جلب سبب الإغلاق بالاسم العربي الجديد، أو وضع نص افتراضي معرّب
        const reason =
            interaction.options?.getString("السبب") ||
            "تم إغلاق التذكرة عبر الأمر بدون تحديد سبب معین.";

        await closeTicket(interaction.channel, interaction.user, reason);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "تم إغلاق التذكرة!",
                    "لقد تم إغلاق هذه التذكرة بنجاح.",
                ),
            ],
        });

        logger.info('Ticket closed successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            reason: reason,
            commandName: 'close'
        });
    },
};
