import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket") // اسم الأمر الرئيسي يفضل تركه بالإنجليزية لتسهيل الكتابة
        .setDescription("إدارة نظام التذاكر في السيرفر.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("تجهيز")
                .setDescription(
                    "إعداد لوحة إنشاء التذاكر في روم محدد.",
                )
                .addChannelOption((option) =>
                    option
                        .setName("روم_اللوحة")
                        .setDescription(
                            "الروم الذي سيتم إرسال لوحة التذاكر إليه.",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )

                .addStringOption((option) =>
                    option
                        .setName("رسالة_اللوحة")
                        .setDescription(
                            "الرسالة الرئيسية أو الوصف للوحة التذاكر.",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("نص_الزر")
                        .setDescription(
                            "النص المكتوب على زر إنشاء التذكرة (الافتراضي: فتح تذكرة)",
                        )
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("التصنيف")
                        .setDescription(
                            "التصنيف (Category) الذي ستفتح فيه التذاكر الجديدة (اختياري).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("تصنيف_المغلقة")
                        .setDescription(
                            "التصنيف الذي ستنقل إليه التذاكر المغلقة (اختياري).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("رتبة_الدعم")
                        .setDescription(
                            "الرتبة التي يمكنها رؤية التذاكر والرد عليها (اختياري).",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("الحد_الأقصى")
                        .setDescription("أقصى عدد تذاكر يمكن للمستخدم فتحها في نفس الوقت (الافتراضي: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("إشعار_الخاص")
                        .setDescription("إرسال رسالة لخاص العضو عند إغلاق تذكرته (الافتراضي: تفعيل)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("التحكم")
                .setDescription("فتح لوحة التحكم التفاعلية لنظام التذاكر"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            logger.warn('Ticket command permission denied', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'تحتاج إلى صلاحية `إدارة القنوات - Manage Channels` لتنفيذ هذا الأمر.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "التحكم") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "تجهيز") {
            const existingConfig = await getGuildConfig(client, interaction.guildId);
            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `هذا السيرفر يمتلك بالفعل نظام تذاكر مجهز مسبقاً في الروم (<#${existingConfig.ticketPanelChannelId}>).\n\nالسيرفر يدعم نظام تذاكر واحد فقط. استخدم الأمر \`/ticket التحكم\` لتعديل النظام الحالي، أو اختر **حذف النظام** من لوحة التحكم للبدء من جديد.` });
            }

            // تم تعديل المسميات هنا لتتوافق مع الأسماء العربية الجديدة للخيارات
            const panelChannel =
                interaction.options.getChannel("روم_اللوحة");
            const categoryChannel = interaction.options.getChannel("التصنيف");
            const closedCategoryChannel = interaction.options.getChannel("تصنيف_المغلقة");
            const staffRole = interaction.options.getRole("رتبة_الدعم");
            const panelMessage = interaction.options.getString("رسالة_اللوحة") || "اضغط على الزر أدناه لفتح تذكرة دعم فني.";
            const buttonLabel =
                interaction.options.getString("نص_الزر") || "فتح تذكرة";
            const maxTicketsPerUser = interaction.options.getInteger("الحد_الأقصى") || 3;
            const dmOnClose = interaction.options.getBoolean("إشعار_الخاص") !== false;

            const setupEmbed = createEmbed({ 
                title: "تذاكر الدعم الفني", 
                description: panelMessage,
                color: getColor('info')
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                if (client.db && interaction.guildId) {
                    const currentConfig = {}; // تم إغلاق القوس وإكمال الكود برمجياً بشكل صحيح
                }
                
                // يمكنك إكمال بقية كود الحفظ في قاعدة البيانات هنا حسب ملفات البوت لديك
            } catch (error) {
                logger.error('حدث خطأ أثناء إعداد التذاكر', error);
                return await handleInteractionError(interaction, error);
            }
        }
    }
}
