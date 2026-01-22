import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';

interface SwipeCardProps {
  title: string;
  description: string | null;
  onSwipe: (direction: 'left' | 'right') => void;
  progress: string;
  hintStyle?: 'bounce' | 'arrows' | 'text';
}

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 300;
const ROTATION_RANGE = 12;

export function SwipeCard({ title, description, onSwipe, progress, hintStyle = 'bounce' }: SwipeCardProps) {
  const x = useMotionValue(0);

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

      {/* Text hint - above card */}
      {hintStyle === 'text' && (
        <motion.div
          className="text-center mb-2 text-sm text-gray-700 font-medium"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          👆 Swipe to vote
        </motion.div>
      )}

      {/* Arrow hints - left and right sides */}
      {hintStyle === 'arrows' && (
        <>
          <motion.div
            className="absolute left-0 top-1/2 -translate-y-1/2 z-0 text-red-400"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 0.6, x: 0 }}
            transition={{ repeat: Infinity, duration: 1.5, repeatType: 'reverse' }}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </motion.div>
          <motion.div
            className="absolute right-0 top-1/2 -translate-y-1/2 z-0 text-green-400"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 0.6, x: 0 }}
            transition={{ repeat: Infinity, duration: 1.5, repeatType: 'reverse' }}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </motion.div>
        </>
      )}

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
        whileTap={{ scale: 1.02 }}
        initial={hintStyle === 'bounce' ? { x: 0 } : undefined}
        animate={
          hintStyle === 'bounce'
            ? {
                x: [0, 15, -15, 10, -10, 0],
              }
            : undefined
        }
        transition={
          hintStyle === 'bounce'
            ? {
                duration: 1,
                delay: 0.3,
                ease: 'easeInOut',
              }
            : undefined
        }
      >
        {/* Nope indicator */}
        <motion.div
          className="absolute top-4 left-4 border-3 border-red-500 text-red-500 px-3 py-1 rounded-lg font-bold text-lg -rotate-12"
          style={{ opacity: leftIndicatorOpacity }}
        >
          NOPE
        </motion.div>

        {/* Yum indicator */}
        <motion.div
          className="absolute top-4 right-4 border-3 border-green-500 text-green-500 px-3 py-1 rounded-lg font-bold text-lg rotate-12"
          style={{ opacity: rightIndicatorOpacity }}
        >
          YUM!
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
          className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center border border-red-400 text-red-400 hover:bg-red-50 active:bg-red-100 active:scale-95 transition-all opacity-70 hover:opacity-100"
          aria-label="Nope"
          data-testid="swipe-no"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <button
          onClick={() => onSwipe('right')}
          className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center border border-green-400 text-green-400 hover:bg-green-50 active:bg-green-100 active:scale-95 transition-all opacity-70 hover:opacity-100"
          aria-label="Yum"
          data-testid="swipe-yes"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
