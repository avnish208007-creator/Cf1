import React from 'react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  className = '',
}) => {
  return (
    <div className={`relative bg-black rounded-lg overflow-hidden flex items-center justify-center ${className}`}>
      <video
        key={src}
        controls
        playsInline
        preload="metadata"
        poster={poster}
        className="w-full h-full object-contain max-h-[70vh] rounded-lg"
      >
        <source src={src} type="video/mp4" />
        Your browser does not support standard MP4 playback.
      </video>
    </div>
  );
};
