# Instagram-style profile-photo crop — replication prompt

Use the following prompt to replicate the Instagram profile-photo crop mechanism
identically for every photo upload across the app (avatars, folder covers, item
photos, album photos). The in-app `CropModal` already implements this behaviour.

> Replicate the Instagram profile-photo crop experience exactly.
>
> The user picks a photo from their local library (no in-app camera capture).
> The raw, uncompressed original is loaded into a fixed-aspect crop frame that
> matches the destination ratio (1:1 for avatars, 3:4 for folder covers, etc.).
> The photo is fitted to cover the frame as best as possible without any
> compression, squashing, or aspect-ratio distortion — it crops, never squashes.
>
> Interaction:
> - **Drag / pan**: one finger (or pointer) drags the photo to reposition it
>   within the frame. Panning reveals the photo's excess / unshown corners.
> - **Pinch-to-zoom**: two fingers pinch to magnify; zoom anchors toward the
>   midpoint of the two fingers so the area you pinch stays under your fingers.
> - **Magnify slider**: an on-screen slider mirrors the pinch zoom for precise
>   single-finger magnification of any area.
> - **Grid overlay**: a subtle rule-of-thirds grid is drawn over the frame while
>   cropping for composition guidance.
> - **No squeeze**: zooming in never stretches the image; the crop always
>   samples the source at its native resolution and only downscales if the
>   result exceeds a max dimension, never upscales.
>
> On save, the visible frame region is rendered to an offscreen canvas at source
> resolution and exported as a JPEG data URL (stored offline). The crop preserves
> original quality as closely as the chosen crop allows, and the saved image
> always fills the destination frame at the chosen aspect ratio.