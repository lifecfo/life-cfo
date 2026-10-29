"use client";

/**
 * All mascot CSS lives here, injected once by MascotHost. Plain <style>
 * (not styled-jsx) so it works the same regardless of the Next.js
 * compiler's styled-jsx support. Idle loops (blink/tail-flick/ear-twitch)
 * are long-cycle keyframe animations that are mostly static with a brief
 * motion near the end of the cycle, so they read as occasional rather than
 * constant. Scene/ambient position changes are plain CSS transitions on
 * `left`/`opacity`/`transform`, driven by inline style changes from JS --
 * the motion itself is native CSS, not computed by any animation library.
 */
export function MascotStyles() {
  return (
    <style>{`
      .mascot-cat-tail {
        animation: mascot-tail-flick 9s ease-in-out infinite;
      }
      @keyframes mascot-tail-flick {
        0%, 85% { transform: rotate(0deg); }
        90% { transform: rotate(-10deg); }
        95% { transform: rotate(4deg); }
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
        93% { transform: rotate(-8deg); }
        96% { transform: rotate(3deg); }
        100% { transform: rotate(0deg); }
      }

      .mascot-cat-eye {
        animation: mascot-blink 6s ease-in-out infinite;
      }
      @keyframes mascot-blink {
        0%, 95% { transform: scaleY(1); }
        97% { transform: scaleY(0.1); }
        99% { transform: scaleY(1); }
        100% { transform: scaleY(1); }
      }

      .mascot-cat-breathe {
        animation: mascot-breathe 4s ease-in-out infinite;
        transform-origin: 20px 30px;
      }
      @keyframes mascot-breathe {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
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

      .mascot-ambient-wrap {
        position: fixed;
        left: 12px;
        bottom: 12px;
        z-index: 60;
        pointer-events: none;
      }

      .mascot-peek-stage {
        position: relative;
        width: 64px;
        height: 64px;
        transition: opacity 0.9s ease-in-out;
      }
      .mascot-peek-stage[data-visible="false"] {
        opacity: 0;
      }
      .mascot-peek-head {
        position: absolute;
        left: 2px;
        bottom: 6px;
        width: 28px;
        height: 28px;
        transition: transform 1.1s ease-out, opacity 0.6s ease-in-out;
        transform: translateY(10px);
        opacity: 0;
      }
      .mascot-peek-head[data-shown="true"] {
        transform: translateY(0);
        opacity: 1;
      }
      .mascot-box {
        position: absolute;
        left: -2px;
        bottom: 0;
        width: 44px;
        height: 32px;
      }

      .mascot-full-cat {
        position: absolute;
        left: 0;
        bottom: 0;
        width: 48px;
        height: 48px;
        transition: transform 2.2s ease-in-out, opacity 1s ease-in-out;
        opacity: 0;
      }
      .mascot-full-cat[data-shown="true"] {
        opacity: 1;
      }

      .mascot-celebrate-wrap {
        position: fixed;
        left: 12px;
        bottom: 12px;
        z-index: 55;
        pointer-events: none;
        width: 48px;
        height: 48px;
        transition: opacity 0.6s ease-in-out, transform 0.6s ease-out;
        opacity: 0;
        transform: translateY(8px);
      }
      .mascot-celebrate-wrap[data-shown="true"] {
        opacity: 1;
        transform: translateY(0);
      }
      .mascot-celebrate-wrap .mascot-cat-tail {
        animation: mascot-tail-wag 0.5s ease-in-out 3;
      }
      @keyframes mascot-tail-wag {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(-18deg); }
      }

      .mascot-scene-band {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        height: 56px;
        z-index: 58;
        pointer-events: none;
        overflow: hidden;
      }
      .mascot-scene-item {
        position: absolute;
        bottom: 0;
        transition: left 1.6s ease-in-out, opacity 0.7s ease-in-out, transform 0.5s ease-in-out;
        opacity: 0;
      }
      .mascot-scene-item[data-shown="true"] {
        opacity: 1;
      }
      .mascot-scene-mouse {
        width: 28px;
        height: 18px;
      }
      .mascot-scene-hole {
        width: 28px;
        height: 20px;
      }
      .mascot-scene-cat {
        width: 44px;
        height: 44px;
      }
      .mascot-scene-crumb {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #1F5E5C;
        opacity: 0;
        transition: opacity 0.6s ease-in-out;
      }
      .mascot-scene-crumb[data-shown="true"] {
        opacity: 0.7;
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

      .mascot-bubble-wrap {
        position: relative;
        display: inline-block;
      }
      .mascot-bubble {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 0;
        min-width: 160px;
        max-width: 220px;
        background: #ffffff;
        border: 1px solid #DAD6CF;
        border-radius: 12px;
        padding: 8px 10px;
        font-size: 12.5px;
        line-height: 1.35;
        color: #2B2B2B;
        box-shadow: 0 4px 14px rgba(0,0,0,0.08);
        transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
        opacity: 0;
        transform: translateY(4px);
        pointer-events: none;
      }
      .mascot-bubble[data-open="true"] {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      @media (prefers-reduced-motion: reduce) {
        .mascot-cat-tail,
        .mascot-cat-ear-left,
        .mascot-cat-ear-right,
        .mascot-cat-eye,
        .mascot-cat-breathe,
        .mascot-mouse-tail,
        .mascot-nudge,
        .mascot-celebrate-wrap .mascot-cat-tail {
          animation: none !important;
        }
        .mascot-peek-stage,
        .mascot-peek-head,
        .mascot-full-cat,
        .mascot-celebrate-wrap,
        .mascot-scene-item,
        .mascot-scene-cheese,
        .mascot-bubble {
          transition: none !important;
        }
      }
    `}</style>
  );
}
