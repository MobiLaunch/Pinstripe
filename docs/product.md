# Product brief

Derived from the design canvas *Fediverse Video App – Aqua Screens*.

## Pitch

A TikTok-style short video app where every account is a real fediverse
account. Videos, posts, follows, likes and boosts federate over ActivityPub,
so Pinstripe users and Mastodon/Pixelfed/Misskey users can follow and reply
to each other.

## Navigation

The three main screens sit side by side and are reached by swiping, or with
the metal tab bar:

```
Feed  ←  Videos (home)  →  Account
```

Sign In, Create Account, Edit Profile and Settings are pushed on top.

## Screens

**Videos (home).** Full-screen vertical video. Glass segmented control on
top: *Following / Local / Federated*. Record button (blue orb) top right.
Right-hand rail: author avatar with follow (+), like, comments, boost, share,
each with a count. Caption bottom-left: display name, full handle
(`@mira@tilde.zone`), text, hashtags, sound credit. Playback progress bar.

**Feed.** Mastodon-style timeline of text and photo posts:
*Home / Local / Federated*. Composer on top with a 500-character count,
attach photo, and visibility (*Public, Unlisted, Followers only, Mentioned
only*). Posts show boosts ("Boosted by …"), reply / boost / favourite counts.

**Account.** Banner, avatar, Edit Profile, settings gear. Display name,
handle, bio, profile fields (verified links get a green check), joined date.
Posts / Following / Followers counts. *Videos / Posts / Boosts* tabs over a
3-column thumbnail grid with view counts.

**Sign In.** Username or email + password, remember me, forgot password,
and *Use an account on another server* (sign in with any fediverse account).

**Create Account.** Display name, username (previewed as
`@you@pinstripe.social`), email, password with strength meter, agree to
server rules. Note explaining the handle works across the fediverse.

**Edit Profile.** Banner (1500×500) and avatar (≥400×400), display name,
bio (500 chars), up to four profile fields with `rel="me"` verification,
*automated account (bot)* flag, *suggest my account to others*.

**Settings.**
- Account: edit profile, email & password.
- Privacy: approve new followers, list in server directory, allow video
  downloads, hide follower counts.
- Federation: blocked servers (domain blocks).
- Playback: autoplay, start muted, save data on cellular.
- Appearance: *Blue / Graphite*.
- Sign out.

## Visual language

Early Mac OS X "Aqua": horizontal pinstripe backgrounds, brushed-metal bars,
glossy gel buttons with a specular highlight, glass orbs, blue segmented
controls, barber-pole progress bars, Lucida Grande type. Tokens live in
`apps/mobile/src/theme/aqua.ts`.

## Open questions

- Which servers ship first: one flagship instance (`pinstripe.social`) or
  self-hostable from day one?
- Video pipeline: transcoding (HLS ladders?), max length, storage/CDN.
- Remote sign-in: pure Mastodon-API client for other servers, or only
  Pinstripe servers?
- Moderation tooling and reporting flows (not on the canvas yet).
- Comments UI, record/upload flow and notifications (not on the canvas yet).
