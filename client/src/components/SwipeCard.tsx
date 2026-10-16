import { motion, useMotionValue, useTransform, PanInfo, useReducedMotion } from 'framer-motion';

interface SwipeCardProps {
  title: string;
  description: string | null;
  onSwipe: (direction: 'left' | 'right') => void;
  progress: string;
  hintStyle?: 'bounce' | 'arrows' | 'text';
  showIntro?: boolean;
}

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 300;
const ROTATION_RANGE = 12;

export function SwipeCard({ title, description, onSwipe, progress, hintStyle = 'bounce', showIntro = true }: SwipeCardProps) {
  const x = useMotionValue(0);
  const reducedMotion = useReducedMotion();
  const animateIntro = showIntro && hintStyle === 'bounce' && !reducedMotion;

  // Transform x movement into rotation (responds faster with smaller range)
  const rotate = useTransform(x, [-100, 0, 100], [-ROTATION_RANGE, 0, ROTATION_RANGE]);

  // Transform x movement into background color tint (responds faster)
  const backgroundColor = useTransform(
    x,
    [-100, -25, 0, 25, 100],
    [
      'rgba(239, 68, 68, 0.25)', // red
      'rgba(239, 68, 68, 0.1)',
      'rgba(255, 255, 255, 1)', // white
      'rgba(34, 197, 94, 0.1)',
      'rgba(34, 197, 94, 0.25)', // green
    ]
  );

  // Indicator opacity (shows earlier with less movement)
  const leftIndicatorOpacity = useTransform(x, [-60, -25, 0], [1, 0.5, 0]);
  const rightIndicatorOpacity = useTransform(x, [0, 25, 60], [0, 0.5, 1]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset, velocity } = info;

    // Check if swipe threshold is met (either by distance or velocity)
    if (offset.x > SWIPE_THRESHOLD || velocity.x > VELOCITY_THRESHOLD) {
      onSwipe('right');
    } else if (offset.x < -SWIPE_THRESHOLD || velocity.x < -VELOCITY_THRESHOLD) {
      onSwipe('left');
    }
  };

  return (
    <div className="relative w-full max-w-xs mx-auto">
      {/* Progress indicator */}
      <div className="text-center mb-4">
        <span className="text-sm text-gray-500">{progress}</span>
      </div>

      <p className="text-center mb-2 text-sm text-gray-700 font-medium">👆 Swipe to vote</p>
      <p className="text-center mb-3 text-xs text-gray-600">Left: No · Right: Yes · You can also tap a choice</p>

      {/* Card */}
      <motion.div
        className="relative w-full h-56 rounded-2xl shadow-2xl cursor-grab active:cursor-grabbing border-2 border-gray-300"
        style={{
          x,
          rotate,
          backgroundColor,
        }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={handleDragEnd}
        whileTap={reducedMotion ? undefined : { scale: 1.02 }}
        data-swipe-intro={animateIntro ? "true" : "false"}
        initial={animateIntro ? { x: 0 } : undefined}
        animate={
          animateIntro
            ? {
                x: [0, -18, 18, 0],
              }
            : undefined
        }
        transition={
          animateIntro
            ? {
                duration: 2,
                delay: 0.3,
                ease: 'easeInOut',
              }
            : undefined
        }
      >
        {/* No indicator */}
        <motion.div
          className="absolute top-4 left-4 border-3 border-red-500 text-red-500 px-3 py-1 rounded-lg font-bold text-lg -rotate-12"
          style={{ opacity: leftIndicatorOpacity }}
        >
          NO
        </motion.div>

        {/* Yes indicator */}
        <motion.div
          className="absolute top-4 right-4 border-3 border-green-500 text-green-500 px-3 py-1 rounded-lg font-bold text-lg rotate-12"
          style={{ opacity: rightIndicatorOpacity }}
        >
          YES
        </motion.div>

        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 pointer-events-none">
          <h2 className="text-2xl font-bold text-center mb-2">{title}</h2>
          {description && (
            <p className="text-gray-600 text-center">{description}</p>
          )}
        </div>
      </motion.div>

      {/* Button fallbacks - smaller and more subtle */}
      <div className="flex justify-center gap-4 mt-5">
        <button
          onClick={() => onSwipe('left')}
          className="btn btn-secondary flex-1 min-h-12 text-red-800 border-red-300 bg-white"
          aria-label="No"
          data-testid="swipe-no"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg><span>No</span>
        </button>

        <button
          onClick={() => onSwipe('right')}
          className="btn btn-primary flex-1 min-h-12"
          aria-label="Yes"
          data-testid="swipe-yes"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg><span>Yes</span>
        </button>
      </div>
    </div>
  );
}
