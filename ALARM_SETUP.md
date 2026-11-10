# Alarm notifications — what must be true outside the code

The app code (service worker, push server in `netlify/functions`, permission prompts) is all in this repo.
Three things live OUTSIDE the code and decide whether alarms ring when the app is closed:

1. **Netlify deploy.** Push this repo to the GitHub repo that Netlify builds. Scheduled functions only run on the
   *published production deploy* (not deploy previews). After deploying, open Netlify → Functions and confirm
   `alarm-tick` is listed as scheduled (`* * * * *`). No keys to set: VAPID keys are generated on first use.
2. **Android APK (PWABuilder).** When generating the package, turn ON **Notification delegation** (and keep
   "Enable notifications" if shown). Without it the Android wrapper cannot show the system "allow notifications"
   prompt and web push is silently refused. Re-generate and reinstall the APK after changing it. The app targets
   Android 13+, which also needs the POST_NOTIFICATIONS permission — PWABuilder adds it when delegation is on.
3. **Phone settings.** Android: Settings → Apps → retrolist → Battery → *Unrestricted*; Notifications on.
   iPhone/iPad: the app must be added to the Home Screen from Safari (iOS 16.4+), opened from there, and then
   notifications allowed from the in-app prompt.

Test: Alarms tab → "send a test alarm" → close or lock the app → a notification should arrive within ~10 s.

Known platform limits (cannot be fixed in code): iPhone has no vibration API for web apps, and when the app is closed
the notification uses the phone's own alert sound/vibration; your chosen tone and vibration play once you tap the
notification and the alarm screen opens.
