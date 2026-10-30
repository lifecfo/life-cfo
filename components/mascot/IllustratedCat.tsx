export const ILLUSTRATED_POSES = [
  "content",
  "alert",
  "dozing",
  "lying",
  "stretch",
  "happy",
  "curious",
  "grooming",
  "lookingback",
  "walking",
] as const;

export type IllustratedPose = (typeof ILLUSTRATED_POSES)[number];

/**
 * Shared drawing scale. Every pose is centred on x = 0 with its paws on
 * y = 0; the viewBox bottom is the same ground line. Width grows for the
 * lying, stretch, and walking drawings instead of squeezing them.
 * Content and alert share one viewBox so a cross-fade does not shift.
 */
export const ILLUSTRATED_POSE_VIEWBOX: Record<IllustratedPose, { w: number; h: number }> = {
  content: { w: 575, h: 970 },
  alert: { w: 575, h: 970 },
  dozing: { w: 536, h: 972 },
  lying: { w: 817, h: 805 },
  stretch: { w: 801, h: 899 },
  happy: { w: 533, h: 970 },
  curious: { w: 532, h: 973 },
  grooming: { w: 542, h: 970 },
  lookingback: { w: 540, h: 970 },
  walking: { w: 878, h: 808 },
};

/** ViewBox height of the default sitting cat. Production size is this tall. */
export const ILLUSTRATED_REF_HEIGHT = ILLUSTRATED_POSE_VIEWBOX.content.h;

export function illustratedPoseSrc(pose: IllustratedPose): string {
  return `/brand/mascot/cat-${pose}.svg`;
}

type IllustratedCatProps = {
  pose: IllustratedPose;
  /** Pixel height. Omit to let CSS size the live mascot. */
  height?: number;
  className?: string;
};

export function IllustratedCat({ pose, height, className }: IllustratedCatProps) {
  const frame = ILLUSTRATED_POSE_VIEWBOX[pose];
  const style = height
    ? { height, width: Math.round((height * frame.w) / frame.h) }
    : undefined;

  return (
    // Static brand SVG. next/image does not fit a transparent line drawing that must keep its viewBox.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={illustratedPoseSrc(pose)}
      alt=""
      draggable={false}
      className={className}
      style={style}
    />
  );
}

type CatPoseStackProps = {
  /** The pose at full opacity. */
  pose: IllustratedPose;
  /** When set, `pose` and this pose are both drawn at 50% so their anchors can be compared. */
  overlay?: IllustratedPose | null;
  /** Subtle vertical breathing. Only the sitting content pose uses it. */
  breathe?: boolean;
};

/**
 * Every pose is stacked in one box, bottom-aligned and centred, at the
 * same scale. Wider drawings spill sideways from that centre. The box
 * itself stays the sitting cat's size, so a swap never moves the anchor.
 */
export function CatPoseStack({ pose, overlay = null, breathe = false }: CatPoseStackProps) {
  const refH = ILLUSTRATED_REF_HEIGHT;
  return (
    <div className="mascot-cat-stage">
      <div className="mascot-cat-breath" data-breathe={breathe ? "true" : "false"}>
        {ILLUSTRATED_POSES.map((name) => {
          const frame = ILLUSTRATED_POSE_VIEWBOX[name];
          const inOverlay = overlay != null && (name === pose || name === overlay);
          const shown = overlay == null && name === pose;
          return (
            // Static brand SVGs. next/image would letterbox the wide poses into the sitting box.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={name}
              src={illustratedPoseSrc(name)}
              alt=""
              draggable={false}
              className="mascot-cat-layer"
              data-pose={name}
              data-shown={shown ? "true" : "false"}
              data-overlay={inOverlay ? "true" : "false"}
              style={{
                width: `calc(var(--mascot-cat-height) * ${frame.w} / ${refH})`,
                height: `calc(var(--mascot-cat-height) * ${frame.h} / ${refH})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
