---
name: Omni AI
description: Iridescent orbital identity with translucent dark and pearl workspace surfaces.
colors:
  night-canvas: "#080a0f"
  dark-surface: "#11131cc4"
  dark-border: "#bac1e212"
  lavender-focus: "#b3a0d9"
  lavender-action: "#d5c9e5"
  lavender-nav-active: "#c8badc"
  lavender-nav-muted: "#8d849f"
  dark-body: "#c9c4d5"
  dark-assistant: "#bdb8cd"
  login-title: "#302b40"
  login-body: "#69647b"
  login-caption: "#69647b"
  login-footer: "#69647b"
  login-link: "#69517c"
  login-error: "#a74561"
  avatar-surface: "#3b304c"
  avatar-ink: "#e0d2ef"
  pearl-canvas: "#f4f3f8"
  pearl-surface: "#ffffffad"
  pearl-border: "#63547d20"
  pearl-title: "#302b40"
  pearl-body: "#494155"
  pearl-muted: "#69647b"
  pearl-action: "#69517c"
typography:
  login-display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "42px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  login-display-mobile:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  dialog-title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    letterSpacing: "-0.6px"
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
  chat:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.6
  login-subtitle:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  action:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  supporting:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  code:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
rounded:
  field: "8px"
  icon: "11px"
  control: "12px"
  mobile-panel: "16px"
  circle: "50%"
spacing:
  inset: "4px"
  compact: "8px"
  control: "12px"
  content: "16px"
  grid: "18px"
  section: "24px"
  desktop-gutter: "32px"
components:
  button-secondary-dark:
    backgroundColor: "#b7aad306"
    textColor: "#bab8cb"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    typography: "{typography.action}"
  button-secondary-dark-hover:
    backgroundColor: "#b7aad312"
  button-secondary-light:
    backgroundColor: "#ffffff70"
    textColor: "{colors.pearl-action}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    typography: "{typography.action}"
  button-generate-dark:
    backgroundColor: "linear-gradient(125deg,#574568c9,#38374ed9)"
    textColor: "{colors.lavender-action}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
    height: "46px"
  button-avatar:
    rounded: "{rounded.circle}"
    padding: "{spacing.inset}"
    size: "44px"
  avatar:
    backgroundColor: "{colors.avatar-surface}"
    textColor: "{colors.avatar-ink}"
    rounded: "{rounded.circle}"
    size: "34px"
  nav-item:
    textColor: "{colors.lavender-nav-muted}"
    rounded: "{rounded.control}"
    padding: "0 21px"
    height: "48px"
    typography: "{typography.action}"
  nav-item-active:
    backgroundColor: "linear-gradient(115deg,#8c73ad18,#908daa0a)"
    textColor: "{colors.lavender-nav-active}"
  context-tag:
    textColor: "#92859f"
    rounded: "5px"
    padding: "3px 6px"
  mode-field:
    backgroundColor: "#b7aad306"
    textColor: "#b3a5c6"
    rounded: "{rounded.field}"
    padding: "5px 26px 5px 10px"
---

# Design System: Omni AI

## Overview

**Creative North Star: "Omni’s orbital workspace"**

This document records the implemented identity, rather than proposing a new brand. The existing iridescent orb supplies the visual signature. Manrope headings and DM Sans copy sit on translucent, softly shaded surfaces, with muted lavender linking controls to the logo.

The workspace has both dark and pearl appearances. Login always uses white pearl glass, matching the default workspace appearance; the workspace preserves the user's appearance choice. The centered login composition is specific to that entrance and is recorded in the surface brief, rather than imposed on other screens.

**Key Characteristics:**

- The incumbent iridescent orb and authored orbital SVG icons.
- Near-black glass and pearl glass as two workspace appearances.
- Lavender emphasis, tinted supporting text, and visible focus.
- A dominant conversation with a fixed composer and bottom navigation.

## Colors

The accent is muted lavender; the orb carries the richer iridescent color. Frontmatter values are extracted from App.jsx and remain the normative record of these observed tokens.

### Primary

Lavender focus marks keyboard location. Lavender action and active-navigation ink distinguish interactive emphasis from ordinary copy. Login links are brighter than the disclaimer around them.

### Neutral

Night canvas and translucent dark surface form the dark workspace field. Dark body and assistant ink distinguish conversation text from quieter controls. Login uses plum title ink and tinted supporting text on pearl glass.

Pearl canvas, translucent white surface, plum titles, and tinted muted ink form the light appearance. Borders shift with the surface rather than reusing dark-theme strokes.

### Semantic

Login error uses muted rose. Avatar surface and ink provide a legible circular fallback when the authenticated Google picture is absent or unavailable.

**The Appearance Rule.** Login always uses white pearl glass, including after signing out of a dark workspace. Workspace surfaces, text, borders, and controls switch together when the user changes appearance; that preference survives sign-out.

## Typography

**Display and heading font:** Manrope with a sans-serif fallback.
**Body and control font:** DM Sans with a system sans-serif fallback.
**Code font:** SFMono-Regular, Consolas, or Liberation Mono.

Manrope provides the compact rounded heading voice; DM Sans keeps long conversation text readable. The source loads both text families through Google Fonts. The genuine Google Identity Services button retains Google's own typography.

The login title uses the two display roles in frontmatter. Its subtitle uses the login-subtitle role, reducing to body size on narrow screens. Dialog headings use dialog-title and reduce to 21px on mobile. Conversation text uses chat, rising to 22px on wide desktops and reducing to body size on mobile, with generous line height. Supporting copy remains distinct from action labels.

**The Icon Rule.** Draw interface icons as SVG with a consistent stroke. Keep real Unicode punctuation as text; do not substitute glyphs for navigation or decorative star icons.

## Layout

The workspace fills the dynamic viewport. The conversation is the flexible center of a desktop grid, with a 180px left rail, 216px right rail, and an 1840px maximum container. Wide desktops increase the rails to 200px and 238px. Side rails disappear progressively as width falls.

The measured composer and bottom navigation reserve their actual height in the shell. The navigation sits above the device safe area; the chat feed scrolls independently. Multiline input changes the dock reserve so the composer cannot cover the conversation.

At 1190px the left rail hides; at 900px the right rail hides; at 600px the app switches to compact mobile controls and 12px workspace gutters. At 1600px the wider desktop spacing applies. Short-height variants condense the header and composer.

The login uses a single centered panel with a 440px maximum width, desktop side padding from desktop-gutter, and wider section separation around its orb. Mobile page gutters are 20px. A height threshold of 650px reduces the logo and vertical padding. Legal copy occupies the footer and respects the device safe area. The implementation has been exercised at 320px width and landscape sizes.

**The Dock Rule.** Reserve the measured fixed dock height, including safe-area padding, before allocating the conversation's height.

## Elevation & Depth

Translucent tonal layering and diffuse downward shadows supply depth. Blur lets the existing field show through the glass rather than simulating a physical material. The source uses 24px backdrop blur for glass and login, with 12px on the modal backdrop.

The sidecar records the exact shadow vocabulary: shallow glass, deeper conversation, floating navigation, composer, login, and modal. Light surfaces use softer plum-tinted shadows. Focus outlines and composer border changes signal interaction independently of ambient elevation.

The source retains some existing combinations of border and shadow; they are observations, not a requirement to duplicate both on every new container.

## Shapes

Controls use the extracted field, icon, and control radii. Circular profile photos crop with object-fit cover; the hit target is larger than the visible image. Conversation bubbles use asymmetric corners to distinguish sender roles.

Mobile chat panels use the mobile-panel radius. Larger incumbent glass panels and the login currently use 20px corners; this observed value is not promoted into a universal future-card rule. Pills are reserved for compact actions such as the genuine Google button. The orb keeps its original silhouette.

## Components

### Buttons

Secondary actions have quiet lavender-tinted backgrounds, a subtle stroke, and a minimum 44px target. Hover deepens the tint; focus shows the lavender outline; pressed actions move down by one pixel. Generate uses the existing shaded lavender treatment and a clearer disabled state.

Google Sign-In is the genuine GIS control, rendered in its white outline pill variant on login. Loading text, a recoverable timeout, and a retry action occupy the same authentication area. No second identity provider is offered.

### Inputs and composer

The composer has a transparent textarea inside a tinted glass container. Focus changes the container border and shadow; the textarea preserves the container treatment. The mode selector uses the mode-field token. The input grows for multiline drafts without displacing the fixed navigation.

### Cards and dialogs

The conversation owns the main content area; supporting desktop rails remain secondary. Account details open a focused dialog with name, email, profile image, and sign-out. Dialog content scrolls when height is constrained.

### Navigation and avatar

Bottom navigation retains Chat, Create, Library, History, settings, and the account photo. Mobile navigation stacks icon and label and distributes available width. Active state uses the active navigation tint and a small indicator.

The avatar button is a 44px circle, containing a 34px picture on desktop or 32px on mobile. The account dialog enlarges the image to 68px. A person SVG replaces a missing or failed photo. The button has an accessible account label and communicates whether its dialog is open.

### Context tags

Small metadata tags use the context-tag token. They communicate artifact context; they are not page headings or promotional labels.

### Brand assets and motion

The orb is the pre-existing embedded PNG in App.jsx, also present as orb.png in the workspace. Its creator and origin beyond this incumbent project are unknown. No new raster brand assets were produced. Google avatars are runtime account content, not brand assets; the white photo in review captures is a synthetic test fixture.

Login has one brief blur-and-translation arrival on the orb. Existing workspace motion remains in place. The global reduced-motion preference disables animation and transitions. Generated images preserve their original aspect ratio and fit within both the viewport and measured feed height.

## Do's and Don'ts

### Do:

- **Do** preserve the incumbent orb, Manrope headings, and DM Sans body copy.
- **Do** switch the workspace's surface, text, border, and control colors together.
- **Do** keep login in white pearl glass and keep the account avatar in bottom navigation.
- **Do** reserve the measured dock and safe area before sizing the conversation.
- **Do** use authored SVG icons, visible keyboard focus, and reduced-motion support.
- **Do** preserve the proportions of profile photos, logos, and generated images.

### Don't:

- **Don't** expose the workspace while signed out or offer an unrequested login provider.
- **Don't** substitute corrupted text glyphs for icons or real Unicode punctuation.
- **Don't** promote the centered login composition into a rule for every screen.
- **Don't** fabricate policy destinations, brand claims, or asset provenance.

