---
name: Footprint Prompt guard
description: An independent browser tool for reviewing estimated generation impact.
colors:
  surface: "#f9faf6"
  toolbar: "#edf2e9"
  footer: "#f0f4ed"
  ink: "#24352c"
  supporting: "#5a655d"
  body: "#526050"
  line: "#dfe5dd"
  sage-action: "#365d35"
  sage-action-hover: "#284b28"
  action-ink: "#ffffff"
  identity: "#355d38"
  warning: "#95572f"
  focus: "#417442"
  selection: "#d6e8ce"
typography:
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "23px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    lineHeight: 1.7
  supporting:
    fontFamily: "system-ui, sans-serif"
    fontSize: "12px"
    lineHeight: 1.65
  measurement:
    fontFamily: "system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  action:
    fontFamily: "system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  panel: "14px"
  action: "8px"
  close: "7px"
spacing:
  compact: "10px"
  toolbar: "18px"
  body: "23px"
  mobile-body: "21px"
components:
  proceed:
    backgroundColor: "{colors.sage-action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.action}"
    padding: "10px 16px"
    height: "44px"
  proceed-hover:
    backgroundColor: "{colors.sage-action-hover}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    width: "440px"
---

# Design System: Footprint Prompt guard

## Overview

**Creative North Star: "A browser tool at the moment of decision"**

This scoped system records the implemented warning and toolbar popup. The user explicitly requested a browser-extension appearance independent of Omni AI. Root DESIGN.md remains the authority for the surrounding app. This system applies to the installed extension and the matching app fallback.

The warning pauses generation, presents the request's estimated water and carbon, and lets the user cancel or proceed. The native browser-tool character supports quick reading and keyboard interaction. These estimates are illustrative input-only assumptions, with methodology available in the dialog.

## Colors

Ivory is the opaque reading surface. Pale sage groups extension identity and footer actions. Dark green provides readable content; stronger sage identifies Proceed. Warm brown marks the warning icon without overwhelming the estimates.

**The Independent Surface Rule.** Preserve Footprint's own palette across both Omni workspace appearances; never inherit the app's lavender or glass styling.

## Typography

Native system sans is appropriate to this compact browser tool. The title is the highest text heading; measurements use larger tabular numerals for comparison. Supporting labels and the expandable methodology remain smaller than the warning sentence. Narrow screens reduce the title and measurement sizes as recorded in the implementation.

## Layout

Desktop warnings sit at the top right, below browser-like page chrome. At widths below 600px, center the dialog with 16px viewport gutters and give both actions equal space. At viewport heights below 550px, use 12px gutters. Only the body scrolls; toolbar and footer stay visible. Toolbar popup width is 320px.

**The Decision Access Rule.** Keep Cancel and Proceed visible when content grows or height shrinks. The body may scroll to preserve both title and action access.

## Elevation & Depth

The panel has one soft downward shadow. The dimmed, blurred page backdrop communicates the paused page; the panel remains opaque. One brief entrance translates upward into place and fades from an already visible state. Reduced-motion preferences disable it and button transitions.

## Shapes

Moderate panel rounding distinguishes the floating tool. Actions have smaller corners and at least a 44px height. The close control is compact. Thin separators organize toolbar, paired measurements and actions; there are no nested metric cards.

## Components

The warning uses an alertdialog title and description, drawn SVG icons, request-specific body, two measurements, expandable assumptions, paused status, and bottom actions. Cancel initially receives focus. Escape, backdrop and close act as cancellation. Keyboard focus remains in the dialog, the app becomes inert, and dismissal restores the previous usable control.

The popup identifies Footprint, describes supported pages and host control, and links to Omni AI. It does not independently override the host flag. Shared styles are bundled into Shadow DOM for the installed extension.

**The Estimate Truth Rule.** Keep the illustrative methodology and provider-variation explanation with the numbers. Never present the values as measured usage or universal industry metrics.

## Do's and Don'ts

- Do use the shared component and impact calculation for extension and fallback.
- Do preserve independent colors, visible focus, themed selection and scrollbars.
- Do retain drafts on cancellation and resume each approved request once.
- Don't inherit the host's glass, orbital, pixel or lavender decoration.
- Don't send generation requests before consent when the host flag is enabled.
- Don't infer image quantity from counts of objects in the depicted scene.
