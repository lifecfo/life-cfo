"use client";

/**
 * All mascot CSS lives here, injected once by MascotHost. Plain <style>
 * (not styled-jsx) so it works regardless of styled-jsx support.
 * The live cat cross-fades between two illustrated poses and breathes
 * with a very small vertical scale. The long-cycle idle loops below
 * still belong to the previous line-art cat on /lab/mascot.
 */
export function MascotStyles() {
  return (
    <style>{`
      :root {
        --mascot-cat-height: 160px;
        --mascot-cat-size: 160px;
      }
      @media (max-width: 767px) {
        :root {
          --mascot-cat-height: 120px;
          --mascot-cat-size: 120px;
        }
      }

      /* ---- Idle loops (always on while the shape is visible) ---- */
      .mascot-cat-tail-tip {
        animation: mascot-tail-tip-flick 26s ease-in-out infinite;
      }
      @keyframes mascot-tail-tip-flick {
        0%, 92% { transform: rotate(0deg); }
        95% { transform: rotate(-10deg); }
        98% { transform: rotate(4deg); }
        100% { transform: rotate(0deg); }
      }

      .mascot-cat-ear-left {
        animation: mascot-ear-flick 38s ease-in-out infinite;
      }
      .mascot-cat-ear-right {
        animation: mascot-ear-flick 44s ease-in-out infinite;
        animation-delay: 3s;
      }
      @keyframes mascot-ear-flick {
        0%, 94% { transform: rotate(0deg); }
        96% { transform: rotate(-12deg); }
        98% { transform: rotate(4deg); }
        100% { transform: rotate(0deg); }
      }

      .mascot-cat-eye-open {
        animation: mascot-blink-open 22s ease-in-out infinite;
      }
      .mascot-cat-eye-closed {
        animation: mascot-blink-closed 22s ease-in-out infinite;
      }
      @keyframes mascot-blink-open {
        0%, 95% { opacity: 1; }
        96.5% { opacity: 0; }
        98% { opacity: 1; }
        100% { opacity: 1; }
      }
      @keyframes mascot-blink-closed {
        0%, 95% { opacity: 0; }
        96.5% { opacity: 1; }
        98% { opacity: 0; }
        100% { opacity: 0; }
      }

      .mascot-cat-whiskers {
        animation: mascot-whisker-twitch 52s ease-in-out infinite;
        transform-origin: 56px 31px;
      }
      @keyframes mascot-whisker-twitch {
        0%, 93% { transform: rotate(0deg); }
        95% { transform: rotate(3deg); }
        97% { transform: rotate(-1deg); }
        100% { transform: rotate(0deg); }
      }

      .mascot-cat-head {
        animation: mascot-head-tilt 33s ease-in-out infinite;
      }
      @keyframes mascot-head-tilt {
        0%, 90% { transform: rotate(0deg); }
        93% { transform: rotate(-4deg); }
        97% { transform: rotate(1deg); }
        100% { transform: rotate(0deg); }
      }

      .mascot-cat-zzz {
        animation: mascot-zzz-float 2.6s ease-in-out infinite;
      }
      @keyframes mascot-zzz-float {
        0% { opacity: 0; transform: translateY(0); }
        30% { opacity: 0.85; }
        100% { opacity: 0; transform: translateY(-10px); }
      }

      .mascot-cat-wiggle {
        animation: mascot-wiggle 0.35s ease-in-out 4;
      }
      @keyframes mascot-wiggle {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(3px); }
      }

      .mascot-cat-pose {
        transition: transform 0.7s ease-in-out, opacity 0.35s ease-in-out;
      }

      .mascot-mouse-tail {
        animation: mascot-mouse-tail-sway 2.4s ease-in-out infinite;
      }
      @keyframes mascot-mouse-tail-sway {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(-6deg); }
      }

      .mascot-nudge {
        animation: mascot-nudge-pulse 0.6s ease-in-out;
      }
      @keyframes mascot-nudge-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); }
      }

      /* ---- Layout: a blank in-flow strip at the end of the page's
             content, on every screen size. Never a fixed overlay, never
             inside a card. ---- */
      .mascot-strip {
        display: flex;
        align-items: flex-start;
        justify-content: flex-end;
        min-height: calc(var(--mascot-cat-height) + 32px);
        padding: 16px 90px 16px 16px;
      }
      @media (max-width: 767px) {
        .mascot-strip {
          justify-content: center;
          padding: 16px;
        }
      }

      .mascot-strip-cat {
        flex-shrink: 0;
        line-height: 0;
        opacity: 1;
        transition: opacity 500ms ease-in-out;
      }
      .mascot-strip-cat[data-visible="false"] {
        opacity: 0;
      }

      /* Illustrated cat. Content and alert share one frame, so the
         cross-fade does not move or resize the drawing. */
      .mascot-cat-stage {
        position: relative;
        height: var(--mascot-cat-height);
        aspect-ratio: 575 / 970;
        transform-origin: center bottom;
      }
      .mascot-cat-stage[data-breathe="true"] {
        animation: mascot-breathe 5.2s ease-in-out infinite;
      }
      @keyframes mascot-breathe {
        0%, 100% { transform: scaleY(1); }
        50% { transform: scaleY(1.015); }
      }
      .mascot-cat-layer {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-position: center bottom;
        opacity: 0;
        transition: opacity 500ms ease-in-out;
      }
      .mascot-cat-layer[data-shown="true"] {
        opacity: 1;
      }

      .mascot-cat-button {
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        display: block;
        width: auto;
        height: auto;
        line-height: 0;
      }

      .mascot-corner--celebrate .mascot-cat-tail-tip {
        animation: mascot-tail-wag 0.5s ease-in-out 3;
      }
      @keyframes mascot-tail-wag {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(-18deg); }
      }

      /* ---- Layout: the scene band (mouse/hole/cheese -- currently paused) ---- */
      .mascot-scene-band {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        height: 84px;
        z-index: 58;
        pointer-events: none;
        overflow: hidden;
      }
      .mascot-scene-item {
        position: absolute;
        bottom: 6px;
        transition: left 1.6s ease-in-out, opacity 0.7s ease-in-out, transform 0.5s ease-in-out;
        opacity: 0;
      }
      .mascot-scene-item[data-shown="true"] {
        opacity: 1;
      }
      .mascot-scene-item svg,
      .mascot-scene-item img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: contain;
        object-position: center bottom;
      }
      .mascot-scene-mouse {
        width: 26px;
        height: 17px;
      }
      .mascot-scene-hole {
        width: 28px;
        height: 20px;
      }
      .mascot-scene-cat {
        width: var(--mascot-cat-size);
        height: var(--mascot-cat-size);
      }
      .mascot-scene-crumb {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #6B7280;
        opacity: 0;
        transition: opacity 0.6s ease-in-out;
      }
      .mascot-scene-crumb[data-shown="true"] {
        opacity: 0.8;
      }
      .mascot-scene-cheese {
        width: 14px;
        height: 10px;
        transition: left 1.6s ease-in-out, opacity 0.7s ease-in-out;
        opacity: 0;
      }
      .mascot-scene-cheese[data-shown="true"] {
        opacity: 1;
      }

      .mascot-squeak {
        position: absolute;
        left: 50%;
        bottom: 100%;
        transform: translateX(-50%) scale(0.6);
        background: #ffffff;
        border: 1px solid #DAD6CF;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        font-size: 11px;
        line-height: 16px;
        text-align: center;
        color: #1F5E5C;
        opacity: 0;
        transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
      }
      .mascot-squeak[data-shown="true"] {
        opacity: 1;
        transform: translateX(-50%) scale(1);
      }

      /* ---- Hand-drawn speech bubble: a real flex sibling of the cat,
             not an absolute overlay, so it's physically contained by the
             strip and can never drift above it into page content. ---- */
      .mascot-bubble-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .mascot-bubble-slot {
        position: relative;
        width: 190px;
        min-height: 70px;
        padding: 16px 18px 26px;
        font-size: 16px;
        line-height: 1.35;
        color: #16413f;
        opacity: 0;
        transition: opacity 500ms ease-in-out;
      }
      .mascot-bubble-slot[data-shown="true"] {
        opacity: 1;
      }
      @media (max-width: 480px) {
        .mascot-bubble-slot {
          width: 130px;
          font-size: 15px;
        }
      }
      .mascot-bubble-text {
        position: relative;
        z-index: 1;
        display: block;
      }

      @media (prefers-reduced-motion: reduce) {
        .mascot-cat-tail-tip,
        .mascot-cat-ear-left,
        .mascot-cat-ear-right,
        .mascot-cat-eye-open,
        .mascot-cat-eye-closed,
        .mascot-cat-whiskers,
        .mascot-cat-head,
        .mascot-cat-zzz,
        .mascot-cat-wiggle,
        .mascot-mouse-tail,
        .mascot-nudge,
        .mascot-corner--celebrate .mascot-cat-tail-tip {
          animation: none !important;
        }
        .mascot-cat-pose,
        .mascot-strip-cat,
        .mascot-scene-item,
        .mascot-scene-cheese,
        .mascot-cat-layer,
        .mascot-bubble-slot {
          transition: none !important;
        }
        .mascot-cat-stage {
          animation: none !important;
        }
      }
    `}</style>
  );
}
