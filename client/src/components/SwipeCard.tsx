import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';

interface SwipeCardProps {
  title: string;
  description: string | null;
  onSwipe: (direction: 'left' | 'right') => void;
  progress: string;
}

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 300;
const ROTATION_RANGE = 12;

export function SwipeCard({ title, description, onSwipe, progress }: SwipeCardProps) {
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

      {/* Card */}
      <motion.div
        className="relative w-full h-56 rounded-2xl shadow-xl cursor-grab active:cursor-grabbing border border-gray-100"
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

      {/* Button fallbacks */}
      <div className="flex justify-center gap-6 mt-5">
        <button
          onClick={() => onSwipe('left')}
          className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center border-2 border-red-500 text-red-500 hover:bg-red-50 active:bg-red-100 active:scale-95 transition-all"
          aria-label="Nope"
          data-testid="swipe-no"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <button
          onClick={() => onSwipe('right')}
          className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center border-2 border-green-500 text-green-500 hover:bg-green-50 active:bg-green-100 active:scale-95 transition-all"
          aria-label="Yum"
          data-testid="swipe-yes"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
