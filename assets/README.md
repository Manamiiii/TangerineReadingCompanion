# Application icon

`tangerine-reading-companion.png` is the transparent master created with the built-in image generation tool, using the user-provided TangerineVideoCurator family icon as the reference. The orange tile, dark brown fruit outline and green leaf match the sibling applications; an open book identifies the reading companion.

`tangerine-reading-companion.ico` contains PNG-backed 16, 24, 32, 48, 64, 128 and 256 pixel frames for future Windows packaging. It is an asset, not a native application or installer.

The master is downscaled with alpha preserved into `public/icons/`: a 32 pixel favicon, a 180 pixel Apple touch icon, and 192/512 pixel PWA icons. PWA icons declare `purpose: any` because the family artwork extends outside the maskable safe area. These public assets are included automatically in the production offline cache.

Generation prompt: Preserve the reference's saturated orange rounded square, thick dark brown tangerine outline, curved stem, green leaf, subtle rim highlights and proportions. Replace only the central play triangle with a bold open book: two facing pages, curved upper edges, center spine and orange negative space. Keep generous separation from the ring and readability at 32 pixels. No text, fine page lines, badges or other symbols. Use real alpha transparency outside the tile and no external shadow.
