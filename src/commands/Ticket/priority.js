import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority") // اسم الأمر الرئيسي يفضل تركه بالإنجليزية لتسهيل الكتابة سريعاً بالـ /
        .setDescription("تحديد مستوى أهمية (أولوية) التذكرة الحالية.")
        .addStringOption((option) =>
            option
                .setName("المستوى") // خيار اختيار مستوى الأولوية بالعربية
                .setDescription("اختر مستوى الأهمية المناسب للتذكرة.")
                .setRequired(true)
                .addChoices(
                    { name: "🚨 عاجل جداً (Urgent)", value: "urgent" },
                    { name: "🔴 مرتفع (High)", value: "high" },
                    { name: "🟡 متوسط (Medium)", value: "medium" },
                    { name: "🟢 منخفض (Low)", value: "low" },
                    { name: "⚪ بدون أولوية (None)", value: "none" },
                ),
            )
        .setDMPermission(false),
    category: "Ticket",

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'يمكنك استخدام هذا الأمر داخل رومات التذاكر الصالحة فقط.' });
        }

        if (!permissionContext.canManageTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'تحتاج إلى صلاحية `إدارة القنوات` أو رتبة `الدعم الفني` المحددة لتغيير أولوية التذكرة.' });
        }

        const priorityLevel = interaction.options.getString("المستوى"); // جلب الخيار بالاسم العربي الجديد
        await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);

        // قاموس بسيط لتحويل قيمة الأولوية لنص عربي منسق في رسالة النجاح
        const priorityNames = {
            urgent: "عاجل جداً",
            high: "مرتفع",
            medium: "متوسط",
            low: "منخفض",
            none: "بدون أولوية"
        };

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "تم تحديث الأولوية",
                    `تم تعديل مستوى أهمية التذكرة إلى: **${priorityNames[priorityLevel] || priorityLevel}**.`,
                ),
            ],
        });

        logger.info('Ticket priority updated successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            priority: priorityLevel,
            commandName: 'priority'
        });
    },
};
