// app.js
// Saavan '25 — Minimalist Role Collection Bot with Email Verification
// Auto-triggers on join, checks existing roles, single category selection
// Student email verification via SMTP + verification code
// Usage: create a bot, give it "Manage Roles", set .env, then: `node app.js`
// Requires: npm i discord.js dotenv nodemailer express

"use strict";

require("dotenv").config();
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField
} = require("discord.js");

const nodemailer = require("nodemailer");

// Express server for health checks
const app = express();
const PORT = process.env.PORT || 3000;

// Health endpoint for UptimeRobot
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    bot: client.user ? "online" : "offline",
    timestamp: new Date().toISOString()
  });
});

app.get("/", (req, res) => {
  res.status(200).json({ 
    message: "Saavan'25 Discord Bot is running!",
    bot: client.user ? client.user.tag : "Not connected",
    uptime: process.uptime()
  });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Health server running on port ${PORT}`);
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_CHANNEL_ID = process.env.ROLE_CHANNEL_ID;

// Email SMTP Configuration
const SMTP_HOST = process.env.SMTP_HOST; // e.g., smtp.gmail.com
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER; // your email
const SMTP_PASS = process.env.SMTP_PASS; // your app password

if (!TOKEN || !GUILD_ID || !ROLE_CHANNEL_ID) {
  console.error("Missing required environment variables");
  process.exit(1);
}

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error("Missing SMTP configuration for email verification");
  process.exit(1);
}

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ] 
});

// ====== ROLE CONFIGURATION ======
const BASE_ROLE = "Newcomer";

const PROTECTED_ROLES = [
  "Admin", "Student Affairs Committee",
  "Finance Head", "Technical Head", "Cultural Head", 
  "Sports Head", "Student Relations Head", "Multimedia Head"
];

// Removed all Lead roles as requested
const ROLE_CATEGORIES = {
  "Development": [
    "Backend Developer", "Frontend Developer", "UI/UX Designer", "DevOps Engineer"
  ],
  "Creative": [
    "Graphics Designer", "Video Editor", "Content Creator", "Social Media Manager"
  ],
  "Business": [
    "Finance Team", "Sponsor Team", "Marketing Team"
  ],
  "Operations": [
    "Event Team", "Logistics Team", "PR Team", "Volunteers"
  ],
  "Departments": [
    "Tech Team", "Sports Team", "Cultural Team"
  ],
  "Participation": [
    "Participants Tech", "Participants Sports", "Participants Cultural",
    "Campus Rep", "Registered"
  ]
};

//... (previous client and role configuration)

// ====== EMAIL CONFIGURATION ======
const transporter = nodemailer.createTransporter({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// ====== USER DATA STORAGE ======
const pendingUsers = new Map(); // Store user data during onboarding
const verificationCodes = new Map(); // Store email verification codes
let availableRoles = new Set();

// ====== EMAIL FUNCTIONS ======
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}

async function sendVerificationEmail(email, code, userName) {
  const mailOptions = {
    from: `"Saavan'25 Verification" <${SMTP_USER}>`,
    to: email,
    subject: "Saavan'25 — Email Verification Code",
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827; background:#ffffff;">
        <div style="background: linear-gradient(135deg,#0b5fff,#6c9dff); border-radius: 14px; padding: 20px; color: #fff; text-align:center;">
          <div style="font-size: 20px; font-weight: 600;">Saavan'25</div>
          <div style="opacity: 0.9; font-size: 13px; margin-top: 4px;">Email Verification</div>
        </div>
        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-top: 16px;">
          <p style="margin:0 0 8px 0;">Hi ${userName},</p>
          <p style="margin:0 0 16px 0;">Use the 6‑digit code below to verify your email for Saavan'25.</p>
          <div style="text-align:center; margin: 18px 0;">
            <div style="display:inline-block; letter-spacing: 6px; font-size: 34px; font-weight: 700; color:#0b5fff; background:#eef2ff; border:1px solid #e0e7ff; padding: 14px 18px; border-radius: 12px;">${code}</div>
          </div>
          <p style="margin:0; color:#374151;">This code expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
        </div>
        <div style="text-align:center; color:#6b7280; font-size:12px; margin-top: 14px;">© ${new Date().getFullYear()} IITM BS Fest</div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

// ====== BOT READY ======
client.once("ready", async () => {
  console.log(`Bot online: ${client.user.tag}`);
  
  const guild = await client.guilds.fetch(GUILD_ID);
  console.log(`Connected to: ${guild.name}`);
  
  await checkExistingRoles(guild);
  await ensureBaseRole(guild);
  await ensureWelcomeChannel(guild);
  await updateChannelPermissions(guild);
  
  console.log("Role collection ready - Security: Newcomers blocked from all channels");
});

// ====== CHECK EXISTING ROLES ======
async function checkExistingRoles(guild) {
  availableRoles.clear();
  const guildRoles = guild.roles.cache;
  
  // Check which roles actually exist
  Object.values(ROLE_CATEGORIES).flat().forEach(roleName => {
    if (guildRoles.find(r => r.name === roleName)) {
      availableRoles.add(roleName);
    }
  });
  
  // Check if base role exists
  if (!guildRoles.find(r => r.name === BASE_ROLE)) {
    console.log(`Warning: Base role "${BASE_ROLE}" not found`);
  }
  
  console.log(`Found ${availableRoles.size} available roles`);
}

// ====== UTILITY FUNCTIONS ======
async function ensureBaseRole(guild) {
  let baseRole = guild.roles.cache.find(r => r.name === BASE_ROLE);
  
  if (!baseRole) {
    baseRole = await guild.roles.create({
      name: BASE_ROLE,
      color: 0x99AAB5,
      permissions: [],
      reason: "Base role for new members"
    });
    console.log(`Created base role: ${BASE_ROLE}`);
  }
  
  // CRITICAL: Newcomers can ONLY see welcome/setup channels, NOTHING ELSE
  guild.channels.cache.forEach(async channel => {
    if (channel.type === 0) { // Text channels only
      try {
        // Block ALL channels by default
        await channel.permissionOverwrites.edit(baseRole, {
          ViewChannel: false,
          SendMessages: false,
          ReadMessageHistory: false
        });
      } catch (error) {
        // Ignore permission errors for individual channels
      }
    }
  });
  
  // Only allow access to role-selection channel if it exists
  const roleChannel = guild.channels.cache.get(ROLE_CHANNEL_ID);
  if (roleChannel) {
    try {
      await roleChannel.permissionOverwrites.edit(baseRole, {
        ViewChannel: true,
        SendMessages: false, // Still can't message there
        ReadMessageHistory: true
      });
    } catch (error) {
      console.error("Error setting role channel permissions:", error);
    }
  }
  
  console.log(`${BASE_ROLE} role configured - CANNOT VIEW ANY CHANNELS until setup complete`);
  return baseRole;
}

async function updateChannelPermissions(guild) {
  // Update permissions for all existing channels when bot starts
  const baseRole = guild.roles.cache.find(r => r.name === BASE_ROLE);
  if (!baseRole) return;
  
  console.log("Updating channel permissions - blocking all channels for Newcomers...");
  
  guild.channels.cache.forEach(async channel => {
    if (channel.type === 0) { // Text channels only
      try {
        // BLOCK ALL CHANNELS - cannot view anything
        await channel.permissionOverwrites.edit(baseRole, {
          ViewChannel: false,
          SendMessages: false,
          ReadMessageHistory: false
        });
      } catch (error) {
        // Ignore permission errors
      }
    }
  });
  
  // Only allow role-selection channel
  const roleChannel = guild.channels.cache.get(ROLE_CHANNEL_ID);
  if (roleChannel) {
    try {
      await roleChannel.permissionOverwrites.edit(baseRole, {
        ViewChannel: true,
        SendMessages: false,
        ReadMessageHistory: true
      });
      console.log("Role-selection channel accessible to Newcomers");
    } catch (error) {
      console.error("Error setting role channel permissions:", error);
    }
  }
  
  console.log("Channel permissions updated - Newcomers blocked from all channels except role-selection");
}

// Create a dedicated welcome channel that newcomers can see
async function ensureWelcomeChannel(guild) {
  const welcomeChannelName = "welcome-setup";
  let welcomeChannel = guild.channels.cache.find(c => c.name === welcomeChannelName);
  
  if (!welcomeChannel) {
    try {
      welcomeChannel = await guild.channels.create({
        name: welcomeChannelName,
        type: 0, // Text channel
        topic: "New member setup and welcome",
        reason: "Welcome channel for new members"
      });
      console.log(`Created welcome channel: ${welcomeChannelName}`);
    } catch (error) {
      console.error("Error creating welcome channel:", error);
      return null;
    }
  }
  
  // Allow newcomers to see this channel
  const baseRole = guild.roles.cache.find(r => r.name === BASE_ROLE);
  if (baseRole) {
    try {
      await welcomeChannel.permissionOverwrites.edit(baseRole, {
        ViewChannel: true,
        SendMessages: false,
        ReadMessageHistory: true
      });
      
      // Also ensure @everyone can see it (for completed users)
      await welcomeChannel.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: true,
        SendMessages: false, // Read-only for everyone
        ReadMessageHistory: true
      });
      
      console.log("Welcome channel permissions set");
    } catch (error) {
      console.error("Error setting welcome channel permissions:", error);
    }
  }
  
  return welcomeChannel;
}

// ====== MEMBER JOIN EVENT ======
client.on("guildMemberAdd", async (member) => {
  try {
    console.log(`New member: ${member.user.tag}`);
    
    // Check roles first
    await checkExistingRoles(member.guild);
    
    // Assign base role if exists
    const baseRole = member.guild.roles.cache.find(r => r.name === BASE_ROLE);
    if (baseRole) {
      await member.roles.add(baseRole);
    }
    
    // Send welcome DM with setup button (private)
    await sendWelcomeDM(member);
    
  } catch (error) {
    console.error("Error handling new member:", error);
  }
});

// ====== WELCOME FUNCTIONS ======
async function sendWelcomeDM(member) {
  try {
    const embed = new EmbedBuilder()
      .setTitle("Welcome to Saavan 2025")
      .setDescription(
        `Welcome ${member.user.username}!\n\n` +
        `Please complete your profile setup by clicking the button below.\n\n` +
        `This will collect your details and help you select appropriate roles for the event.`
      )
      .setColor(0x5865F2);

    const button = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_${member.id}`)
          .setLabel("Start Setup")
          .setStyle(ButtonStyle.Primary)
      );

    await member.send({ embeds: [embed], components: [button] });
    console.log(`Welcome DM with setup button sent to ${member.user.tag}`);
  } catch (error) {
    console.log(`Could not DM ${member.user.tag}, sending in channel instead`);
    await sendRoleSelectionPrompt(member);
  }
}

async function sendRoleSelectionPrompt(member) {
  // Fallback function - only used when DM fails
  const channel = member.guild.channels.cache.get(ROLE_CHANNEL_ID);
  if (!channel) {
    // Try welcome channel if role channel doesn't exist
    const welcomeChannel = member.guild.channels.cache.find(c => c.name === "welcome-setup");
    if (!welcomeChannel) return;
    
    const embed = new EmbedBuilder()
      .setTitle("Complete Profile Setup")
      .setDescription(`${member} please check your DMs to complete setup. If you didn't receive a DM, click the button below.`)
      .setColor(0x5865F2);

    const button = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`setup_${member.id}`)
          .setLabel("Start Setup")
          .setStyle(ButtonStyle.Primary)
      );

    const message = await welcomeChannel.send({ 
      embeds: [embed], 
      components: [button] 
    });

    // Auto-delete after 5 minutes
    setTimeout(() => {
      message.delete().catch(() => {});
    }, 300000);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Complete Profile Setup")
    .setDescription(`${member} please check your DMs to complete setup. If you didn't receive a DM, click the button below.`)
    .setColor(0x5865F2);

  const button = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`setup_${member.id}`)
        .setLabel("Start Setup")
        .setStyle(ButtonStyle.Primary)
    );

  const message = await channel.send({ 
    embeds: [embed], 
    components: [button] 
  });

  // Auto-delete after 5 minutes
  setTimeout(() => {
    message.delete().catch(() => {});
  }, 300000);
}

// ====== INTERACTION HANDLERS ======
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    }
  } catch (error) {
    console.error("Interaction error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "An error occurred.", ephemeral: true });
    }
  }
});

async function handleButtonInteraction(interaction) {
  const { customId } = interaction;

  if (customId.startsWith("setup_")) {
    const userId = customId.split("_")[1];
    if (interaction.user.id !== userId) {
      await interaction.reply({ 
        content: "This setup is not for you.", 
        ephemeral: true
      });
      return;
    }
    await showInfoModal(interaction);
  } else if (customId === "proceed_to_roles") {
    // For button interactions, deferUpdate before long updates
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    await showCategorySelection(interaction);
  } else if (customId === "back_to_categories") {
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    await showCategorySelection(interaction);
  } else if (customId === "verify_email") {
    await showVerificationModal(interaction);
  } else if (customId === "resend_code") {
    // Defer ephemeral reply quickly
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferReply({ ephemeral: true }); } catch (_) {}
    }
    await resendVerificationCode(interaction);
  } else if (customId.startsWith("toggle_")) {
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    await toggleRole(interaction);
  } else if (customId === "complete_setup") {
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    await completeSetup(interaction);
  }
}

async function showInfoModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(`info_${interaction.user.id}`)
    .setTitle("Profile Information");

  const nameInput = new TextInputBuilder()
    .setCustomId("full_name")
    .setLabel("Full Name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  const emailInput = new TextInputBuilder()
    .setCustomId("student_email")
    .setLabel("Student Email ID")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder("your.name@college.edu");

  const row1 = new ActionRowBuilder().addComponents(nameInput);
  const row2 = new ActionRowBuilder().addComponents(emailInput);

  modal.addComponents(row1, row2);
  await interaction.showModal(modal);
}

async function showVerificationModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(`verify_${interaction.user.id}`)
    .setTitle("Enter Verification Code");

  const codeInput = new TextInputBuilder()
    .setCustomId("verification_code")
    .setLabel("6-digit Code")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(6)
    .setMinLength(6)
    .setPlaceholder("123456");

  const row1 = new ActionRowBuilder().addComponents(codeInput);
  modal.addComponents(row1);
  await interaction.showModal(modal);
  // Add a quick typing/feedback ping in DM if possible
}

async function resendVerificationCode(interaction) {
  const session = pendingUsers.get(interaction.user.id);
  if (!session) {
    // If we deferred, use editReply; otherwise ephemeral reply
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: "No active verification session. Please restart setup." });
    } else {
      await interaction.reply({ content: "No active verification session. Please restart setup.", ephemeral: true });
    }
    return;
  }
  const code = generateVerificationCode();
  verificationCodes.set(interaction.user.id, {
    code,
    email: session.studentEmail,
    fullName: session.fullName,
    expires: Date.now() + 10 * 60 * 1000
  });
  const emailSent = await sendVerificationEmail(session.studentEmail, code, session.fullName);
  const content = emailSent
    ? `Sent a new code to ${session.studentEmail}. Check your inbox/spam.`
    : "Failed to send code. Try again later.";
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content });
  } else {
    await interaction.reply({ content, ephemeral: true });
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId.startsWith("info_")) {
    // Defer immediately to avoid 3s timeout while we send the email
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferReply({ ephemeral: true }); } catch (_) {}
    }
    const fullName = interaction.fields.getTextInputValue("full_name");
    const studentEmail = interaction.fields.getTextInputValue("student_email");

    // Quick domain check: allow only IITM BS study emails
    if (!studentEmail.toLowerCase().endsWith("@ds.study.iitm.ac.in") && !studentEmail.toLowerCase().endsWith("@es.study.iitm.ac.in")) {
      await interaction.editReply({
        content: "Please use your IITM BS student email (@ds.study.iitm.ac.in or @es.study.iitm.ac.in)"
      });
      return;
    }
    
    // Store user data
    pendingUsers.set(interaction.user.id, { fullName, studentEmail });
    
    // Generate and send verification code
    const code = generateVerificationCode();
    verificationCodes.set(interaction.user.id, {
      code,
      email: studentEmail,
      fullName,
      expires: Date.now() + 10 * 60 * 1000
    });
    
    const emailSent = await sendVerificationEmail(studentEmail, code, fullName);
    if (!emailSent) {
      await interaction.editReply({
        content: "Failed to send verification email. Please try again later or contact an admin."
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle("Verification Email Sent")
      .setDescription(
        `Sent a 6-digit code to ${studentEmail}. Check your inbox/spam.\n` +
        `Click the button below to enter the code. Expires in 10 minutes.`
      )
      .setColor(0x5865F2)
      .setFooter({ text: "This is quick—usually arrives in a few seconds." });
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("verify_email")
          .setLabel("Verify Email")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("resend_code")
          .setLabel("Resend Code")
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.editReply({ embeds: [embed], components: [row] });
  } else if (interaction.customId.startsWith("verify_")) {
    // Handle verification code submission
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferReply({ ephemeral: true }); } catch (_) {}
    }
    const enteredCode = interaction.fields.getTextInputValue("verification_code").trim();
    const session = verificationCodes.get(interaction.user.id);
    
    if (!session) {
      await interaction.editReply({ content: "No active verification session. Please restart setup." });
      return;
    }
    
    if (Date.now() > session.expires) {
      verificationCodes.delete(interaction.user.id);
      await interaction.editReply({ content: "Your verification code has expired. Click Resend Code and try again." });
      return;
    }
    
    if (enteredCode !== session.code) {
      await interaction.editReply({ content: "Invalid code. Please try again or click Resend Code." });
      return;
    }
    
    // Verified: proceed with updating nickname and assigning email role
    try {
      const guild = client.guilds.cache.get(GUILD_ID);
      const member = await guild.members.fetch(interaction.user.id);
      await processUserInfo(interaction, member, session.fullName, session.email);
    } catch (e) {
      // Continue; processUserInfo already logs errors
    }
    
    verificationCodes.delete(interaction.user.id);
    const user = pendingUsers.get(interaction.user.id) || { fullName: session.fullName, studentEmail: session.email };
    await showInfoConfirmation(interaction, user.fullName, user.studentEmail);
  }
}

async function processUserInfo(interaction, member, fullName, studentEmail) {
  try {
    // Update nickname to full name
    await member.setNickname(fullName);
    console.log(`Updated nickname for ${member.user.tag} to ${fullName}`);
    
    // Create role with full email ID and assign it
    let emailRole = member.guild.roles.cache.find(r => r.name === studentEmail);
    
    if (!emailRole) {
      emailRole = await member.guild.roles.create({
        name: studentEmail,
        color: 0x99AAB5,
        permissions: [],
        reason: `Email role for ${fullName}`
      });
      console.log(`Created role: ${studentEmail}`);
    }
    
    await member.roles.add(emailRole);
    console.log(`Assigned email role ${studentEmail} to ${member.user.tag}`);
    
  } catch (error) {
    console.error("Error processing user info:", error);
  }
}

async function showInfoConfirmation(interaction, fullName, studentEmail) {
  const embed = new EmbedBuilder()
    .setTitle("Information Saved")
    .setDescription(
      `Name: ${fullName}\n` +
      `Email: ${studentEmail}\n\n` +
      `Now select your category:`
    )
    .setColor(0x5865F2);

  const button = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("proceed_to_roles")
        .setLabel("Select Category")
        .setStyle(ButtonStyle.Primary)
    );

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components: [button] });
  } else {
    await interaction.reply({ embeds: [embed], components: [button], ephemeral: true });
  }
}

async function showCategorySelection(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("Select One Category")
    .setDescription("Choose the category that best matches your skills:")
    .setColor(0x5865F2);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`category_${interaction.user.id}`)
    .setPlaceholder("Choose one category")
    .setMinValues(1)
    .setMaxValues(1); // Only one selection allowed

  Object.entries(ROLE_CATEGORIES).forEach(([category, roles]) => {
    const availableInCategory = roles.filter(role => availableRoles.has(role));
    if (availableInCategory.length > 0) {
      selectMenu.addOptions({
        label: category,
        value: category,
        description: `${availableInCategory.length} roles available`
      });
    }
  });

  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleSelectMenu(interaction) {
  if (interaction.customId.startsWith("category_")) {
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    const selectedCategory = interaction.values[0]; // Only one value since maxValues = 1
    await showCategoryRoles(interaction, selectedCategory);
  }
}

async function showCategoryRoles(interaction, category) {
  // Get member from guild (since interaction.member is null in DMs)
  const guild = client.guilds.cache.get(GUILD_ID);
  const member = await guild.members.fetch(interaction.user.id);
  const userRoles = member.roles.cache;
  const roles = ROLE_CATEGORIES[category].filter(role => availableRoles.has(role));
  
  if (roles.length === 0) {
    await interaction.editReply({
      content: "No roles available in this category.",
      embeds: [],
      components: []
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${category} Roles`)
    .setDescription("Select roles that match your skills:")
    .setColor(0x5865F2);

  let roleList = "";
  roles.forEach(roleName => {
    const hasRole = userRoles.find(r => r.name === roleName);
    roleList += `${hasRole ? '[X]' : '[ ]'} ${roleName}\n`;
  });
  
  embed.addFields({
    name: "Available Roles",
    value: roleList,
    inline: false
  });

  // Create buttons for roles
  const buttons = [];
  for (let i = 0; i < roles.length; i += 5) {
    const row = new ActionRowBuilder();
    const roleSlice = roles.slice(i, i + 5);
    
    roleSlice.forEach(roleName => {
      const hasRole = userRoles.find(r => r.name === roleName);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`toggle_${roleName.replace(/\s+/g, "_")}`)
          .setLabel(roleName.length > 20 ? roleName.substring(0, 17) + "..." : roleName)
          .setStyle(hasRole ? ButtonStyle.Success : ButtonStyle.Secondary)
      );
    });
    
    buttons.push(row);
  }

  // Add navigation buttons (back and complete)
  const navRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("back_to_categories")
        .setLabel("← Back to Categories")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("complete_setup")
        .setLabel("Complete Setup")
        .setStyle(ButtonStyle.Primary)
    );
  
  buttons.push(navRow);

  await interaction.editReply({ embeds: [embed], components: buttons });
}

async function toggleRole(interaction) {
  const roleName = interaction.customId.replace("toggle_", "").replace(/_/g, " ");
  
  // Get member from guild (since interaction.member is null in DMs)
  const guild = client.guilds.cache.get(GUILD_ID);
  const member = await guild.members.fetch(interaction.user.id);
  
  if (PROTECTED_ROLES.includes(roleName)) {
    await interaction.reply({ 
      content: "This role requires admin assignment.", 
      ephemeral: true
    });
    return;
  }
  
  if (!availableRoles.has(roleName)) {
    await interaction.reply({ 
      content: "Role not available.", 
      ephemeral: true
    });
    return;
  }
  
  const role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    await interaction.reply({ 
      content: "Role not found.", 
      ephemeral: true
    });
    return;
  }
  
  const hasRole = member.roles.cache.has(role.id);
  
  try {
    if (hasRole) {
      await member.roles.remove(role);
    } else {
      await member.roles.add(role);
    }
    
    // Update the button style and recreate all components
    const embed = interaction.message.embeds[0];
    const categoryName = embed.title.replace(" Roles", "");
    const roles = ROLE_CATEGORIES[categoryName].filter(role => availableRoles.has(role));
    const userRoles = member.roles.cache;
    
    // Recreate all role buttons
    const buttons = [];
    for (let i = 0; i < roles.length; i += 5) {
      const row = new ActionRowBuilder();
      const roleSlice = roles.slice(i, i + 5);
      
      roleSlice.forEach(rName => {
        const hasR = userRoles.find(r => r.name === rName);
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`toggle_${rName.replace(/\s+/g, "_")}`)
            .setLabel(rName.length > 20 ? rName.substring(0, 17) + "..." : rName)
            .setStyle(hasR ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
      });
      
      buttons.push(row);
    }

    // Add navigation buttons (back and complete)
    const navRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("back_to_categories")
          .setLabel("← Back to Categories")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("complete_setup")
          .setLabel("Complete Setup")
          .setStyle(ButtonStyle.Primary)
      );
    
    buttons.push(navRow);
    
    // Update role list in embed
    let roleList = "";
    roles.forEach(rName => {
      const hasR = userRoles.find(r => r.name === rName);
      roleList += `${hasR ? '[X]' : '[ ]'} ${rName}\n`;
    });
    
    const updatedEmbed = new EmbedBuilder()
      .setTitle(embed.title)
      .setDescription(embed.description)
      .setColor(embed.color)
      .addFields({
        name: "Available Roles",
        value: roleList,
        inline: false
      });
    
    await interaction.editReply({ embeds: [updatedEmbed], components: buttons });
    
  } catch (error) {
    if (interaction.deferred) {
      await interaction.editReply({ content: "Failed to update role." });
    } else {
      await interaction.reply({ content: "Failed to update role.", ephemeral: true });
    }
  }
}

async function completeSetup(interaction) {
  const userData = pendingUsers.get(interaction.user.id);
  
  if (!userData) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: "Setup data not found.", components: [] });
    } else {
      await interaction.reply({ content: "Setup data not found.", ephemeral: true });
    }
    return;
  }
  
  console.log(`Setup completed: ${interaction.user.tag} - ${userData.fullName} - ${userData.studentEmail}`);
  
  // Get member from guild and remove base role so they can message anywhere
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(interaction.user.id);
    const baseRole = guild.roles.cache.find(r => r.name === BASE_ROLE);
    
    if (baseRole && member.roles.cache.has(baseRole.id)) {
      await member.roles.remove(baseRole);
      console.log(`Removed ${BASE_ROLE} role from ${member.user.tag} - can now message anywhere`);
    }
  } catch (error) {
    console.error("Error removing base role:", error);
  }
  
  pendingUsers.delete(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle("Setup Complete")
    .setDescription(`Welcome ${userData.fullName}! Your profile has been created and you can now access all channels.`)
    .setColor(0x00FF00);
  
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components: [] });
  } else {
    await interaction.reply({ embeds: [embed], components: [] });
  }
  
  // Auto-delete after 10 seconds
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, 10000);
  
  // Try to delete any fallback channel message (if DM failed)
  try {
    const channel = interaction.guild?.channels?.cache?.get(ROLE_CHANNEL_ID);
    if (channel) {
      const messages = await channel.messages.fetch({ limit: 10 });
      const userPrompt = messages.find(m => 
        m.embeds[0]?.description?.includes(interaction.user.id)
      );
      if (userPrompt) {
        userPrompt.delete().catch(() => {});
      }
    }
  } catch (error) {
    // Ignore errors - channel message might not exist
  }
}

// ====== ADMIN COMMANDS ======
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;
  
  const command = message.content.slice(1).toLowerCase();
  
  if (command === "check-roles" && message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    await checkExistingRoles(message.guild);
    await message.reply(`Found ${availableRoles.size} available roles.`);
  } else if (command === "fix-permissions" && message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    await updateChannelPermissions(message.guild);
    await message.reply("Updated channel permissions - Newcomers now blocked from all channels except welcome areas.");
  } else if (command === "setup-welcome" && message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    await ensureWelcomeChannel(message.guild);
    await message.reply("Welcome channel created/updated for new members.");
  } else if (command === "test-email" && message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    // Test email functionality
    const testCode = generateVerificationCode();
    const emailSent = await sendVerificationEmail(SMTP_USER, testCode, "Test User");
    await message.reply(emailSent ? `✅ Test email sent with code: ${testCode}` : "❌ Email test failed");
  } else if (command === "cleanup-pending" && message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    // Clean up expired verification codes
    const now = Date.now();
    let cleaned = 0;
    for (const [userId, verification] of verificationCodes.entries()) {
      if (now > verification.expires) {
        verificationCodes.delete(userId);
        pendingUsers.delete(userId);
        cleaned++;
      }
    }
    await message.reply(`🧹 Cleaned up ${cleaned} expired verification sessions.`);
  }
});

// ====== ERROR HANDLING ======
client.on("error", console.error);

// ====== LOGIN ======
console.log("Starting role collection bot with email verification...");
console.log("📧 SMTP Email verification enabled");
client.login(TOKEN);
