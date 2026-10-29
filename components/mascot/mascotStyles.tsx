"use client";

/**
 * All mascot CSS lives here, injected once by MascotHost. Plain <style>
 * (not styled-jsx) so it works regardless of styled-jsx support. Idle
 * loops (blink/tail-flick/ear-twitch/walk-cycle) are CSS keyframes, mostly
 * static with brief motion -- JS only decides WHEN to mount/swap classes,
 * never computes the motion itself.
 */
export function MascotStyles() {
  return (
    <style>{`
      :root {
        --mascot-cat-size: 120px;
      }
      @media (max-width: 640px) {
        :root {
          --mascot-cat-size: 96px;
        }
      }

      /* ---- Idle loops (always on while the shape is visible) ---- */
      .mascot-cat-tail {
        animation: mascot-tail-flick 9s ease-in-out infinite;
      }
      @keyframes mascot-tail-flick {
        0%, 85% { transform: rotate(0deg); }
        90% { transform: rotate(-8deg); }
        95% { transform: rotate(3deg); }
        100% { transform: rotate(0deg); }
      }

      .mascot-cat-ear-left {
        animation: mascot-ear-twitch 11s ease-in-out infinite;
      }
      .mascot-cat-ear-right {
        animation: mascot-ear-twitch 12.5s ease-in-out infinite;
        animation-delay: 1.2s;
      }
      @keyframes mascot-ear-twitch {
        0%, 90% { transform: rotate(0deg); }
        93% { transform: rotate(-6deg); }
        96% { transform: rotate(2deg); }
        100% { transform: rotate(0deg); }
      }
      .mascot-cat-ears-up {
        transform: translateY(-2px);
      }

      .mascot-cat-eyelid {
        transform: scaleY(0);
        animation: mascot-blink 6s ease-in-out infinite;
      }
      @keyframes mascot-blink {
        0%, 95% { transform: scaleY(0); }
        97% { transform: scaleY(1); }
        99% { transform: scaleY(0); }
        100% { transform: scaleY(0); }
      }

      .mascot-cat-breathe {
        animation: mascot-breathe 4s ease-in-out infinite;
      }
      @keyframes mascot-breathe {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
      }

      .mascot-cat-zzz {
        animation: mascot-zzz-float 2.6s ease-in-out infinite;
      }
      @keyframes mascot-zzz-float {
        0% { opacity: 0; transform: translateY(0); }
        30% { opacity: 0.85; }
        100% { opacity: 0; transform: translateY(-10px); }
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

      /* ---- Walk cycle (only while pose="walking") ---- */
      .mascot-cat-walk-legs .mascot-cat-leg-front {
        animation: mascot-leg-step 0.9s ease-in-out infinite;
      }
      .mascot-cat-walk-legs .mascot-cat-leg-back {
        animation: mascot-leg-step 0.9s ease-in-out infinite;
        animation-delay: 0.45s;
      }
      @keyframes mascot-leg-step {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
      .mascot-cat-walk-body {
        animation: mascot-body-bob 0.9s ease-in-out infinite;
      }
      @keyframes mascot-body-bob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-1.5px); }
      }

      /* ---- Tail wag (celebration) ---- */
      .mascot-corner--celebrate .mascot-cat-tail {
        animation: mascot-tail-wag 0.5s ease-in-out 3;
      }
      @keyframes mascot-tail-wag {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(-16deg); }
      }

      /* ---- Layout: the cat lives beside the content (desktop/tablet
             gutter) or in-flow at the end of it (mobile). Never a fixed
             overlay, never inside a card. ---- */
      .mascot-corner-gutter {
        position: relative;
        height: 0;
        overflow: visible;
      }
      .mascot-corner-gutter-cat {
        position: sticky;
        top: 130px;
        width: var(--mascot-cat-size);
        height: var(--mascot-cat-size);
        margin-left: 100%;
        transform: translateX(28px);
        transition: opacity 0.9s ease-in-out;
      }
      .mascot-corner-gutter-cat[data-visible="false"] {
        opacity: 0;
      }
      .mascot-corner-gutter-cat svg {
        width: 100%;
        height: 100%;
      }

      .mascot-corner-strip {
        display: flex;
        justify-content: center;
        padding: 16px 0 8px;
      }
      .mascot-corner-strip-cat {
        width: var(--mascot-cat-size);
        height: var(--mascot-cat-size);
        transition: opacity 0.9s ease-in-out;
      }
      .mascot-corner-strip-cat[data-visible="false"] {
        opacity: 0;
      }
      .mascot-corner-strip-cat svg {
        width: 100%;
        height: 100%;
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
      .mascot-scene-item svg {
        width: 100%;
        height: 100%;
        display: block;
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

      /* ---- Hand-drawn speech bubble ---- */
      .mascot-bubble-wrap {
        position: relative;
        display: inline-block;
      }
      .mascot-bubble {
        position: absolute;
        bottom: calc(100% + 12px);
        left: 50%;
        transform: translate(-50%, 4px);
        min-width: 160px;
        max-width: 230px;
        padding: 18px 20px 30px;
        font-size: 16px;
        line-height: 1.4;
        color: #16413f;
        opacity: 0;
        transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
        pointer-events: none;
      }
      .mascot-bubble[data-tail-side="right"] {
        left: auto;
        right: 50%;
      }
      .mascot-bubble[data-open="true"] {
        opacity: 1;
        transform: translate(-50%, 0);
        pointer-events: auto;
      }
      .mascot-bubble[data-open="true"][data-tail-side="right"] {
        transform: translate(50%, 0);
      }
      .mascot-bubble-text {
        position: relative;
        z-index: 1;
        display: block;
      }

      @media (prefers-reduced-motion: reduce) {
        .mascot-cat-tail,
        .mascot-cat-ear-left,
        .mascot-cat-ear-right,
        .mascot-cat-eyelid,
        .mascot-cat-breathe,
        .mascot-cat-zzz,
        .mascot-mouse-tail,
        .mascot-nudge,
        .mascot-cat-walk-legs .mascot-cat-leg-front,
        .mascot-cat-walk-legs .mascot-cat-leg-back,
        .mascot-cat-walk-body,
        .mascot-corner--celebrate .mascot-cat-tail {
          animation: none !important;
        }
        .mascot-corner-gutter-cat,
        .mascot-corner-strip-cat,
        .mascot-scene-item,
        .mascot-scene-cheese,
        .mascot-bubble {
          transition: none !important;
        }
      }
    `}</style>
  );
}
