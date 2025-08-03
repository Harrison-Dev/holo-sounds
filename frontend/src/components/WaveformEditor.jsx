import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

const WaveformEditor = ({ audioUrl, onRegionUpdate }) => {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const regionsRef = useRef(null);
  const zoomLevelRef = useRef(1); // Use ref to avoid re-renders
  const isLoopingRef = useRef(false);
  const regionRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [region, setRegion] = useState(null);
  const [zoomDisplay, setZoomDisplay] = useState(100); // For display only
  const [totalDuration, setTotalDuration] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [editingRegion, setEditingRegion] = useState({ start: false, end: false });
  const [tempRegionTimes, setTempRegionTimes] = useState({ start: '', end: '' });

  useEffect(() => {
    if (!audioUrl || !containerRef.current) return;

    // Create WaveSurfer instance
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4F9CF9',
      progressColor: '#1E5BA8',
      cursorColor: '#1E5BA8',
      barWidth: 2,
      barRadius: 3,
      cursorWidth: 1,
      height: 200,
      barGap: 3,
      minPxPerSec: 50,
      normalize: true,
      splitChannels: false,
      autoScroll: false, // Disable auto-scroll during playback
    });

    // Initialize regions plugin
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    regionsRef.current = regions;

    // Load audio
    wavesurfer.load(audioUrl);

    // Event listeners
    wavesurfer.on('ready', () => {
      const duration = wavesurfer.getDuration();
      setDuration(duration);
      setTotalDuration(duration);
      zoomLevelRef.current = 1; // Reset zoom to 100%
      setZoomDisplay(100);
      
      // Create initial region covering the entire audio
      const region = regions.addRegion({
        start: 0,
        end: duration,
        color: 'rgba(79, 156, 249, 0.3)',
        drag: true,
        resize: true,
      });
      
      setRegion(region);
      regionRef.current = region;
      
      // Notify parent of initial region
      if (onRegionUpdate) {
        onRegionUpdate({
          start: 0,
          end: duration,
        });
      }
    });

    wavesurfer.on('audioprocess', () => {
      const time = wavesurfer.getCurrentTime();
      setCurrentTime(time);
      
      // Check if we've reached the region end
      const currentRegion = regionRef.current;
      const currentIsLooping = isLoopingRef.current;
      
      if (currentRegion && time >= currentRegion.end) {
        if (currentIsLooping) {
          // Loop: jump back to region start and continue playing
          wavesurfer.setTime(currentRegion.start);
        } else {
          // No loop: stop playback at region end
          wavesurfer.pause();
          wavesurfer.setTime(currentRegion.end);
        }
      }
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('finish', () => {
      // This handles when the entire audio file finishes playing
      // Our region-based stopping is handled in audioprocess event
      const currentRegion = regionRef.current;
      const currentIsLooping = isLoopingRef.current;
      
      if (currentIsLooping && currentRegion) {
        wavesurfer.setTime(currentRegion.start);
        wavesurfer.play();
      }
    });

    // Region update listener
    regions.on('region-updated', (updatedRegion) => {
      setRegion(updatedRegion);
      regionRef.current = updatedRegion;
      if (onRegionUpdate) {
        onRegionUpdate({
          start: updatedRegion.start,
          end: updatedRegion.end,
        });
      }
    });

    // Handle mouse wheel zoom
    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Use multiplicative zoom for better feel
      const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18; // Zoom out or zoom in
      const currentZoom = zoomLevelRef.current;
      const newZoomLevel = Math.min(Math.max(currentZoom * zoomFactor, 0.1), 10); // 10% to 1000%
      
      // Update refs and display
      zoomLevelRef.current = newZoomLevel;
      setZoomDisplay(Math.round(newZoomLevel * 100));
      
      // Apply zoom - higher zoom level means more pixels per second
      const basePixelsPerSec = 50;
      const pixelsPerSec = basePixelsPerSec * newZoomLevel;
      wavesurfer.zoom(pixelsPerSec);
      
      // Center on region if it exists
      if (region) {
        setTimeout(() => {
          const regionCenter = (region.start + region.end) / 2;
          const scrollPosition = (regionCenter / totalDuration) * wavesurfer.getWrapper().scrollWidth;
          const containerWidth = wavesurfer.getWrapper().clientWidth;
          wavesurfer.getWrapper().scrollLeft = scrollPosition - containerWidth / 2;
        }, 10);
      }
    };

    const waveformContainer = containerRef.current;
    waveformContainer.addEventListener('wheel', handleWheel, { passive: false });

    wavesurferRef.current = wavesurfer;

    return () => {
      waveformContainer?.removeEventListener('wheel', handleWheel);
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  // Keep refs in sync with state
  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  const handlePlayPause = () => {
    if (wavesurferRef.current && region) {
      if (isPlaying) {
        wavesurferRef.current.pause();
      } else {
        // Start playing from region start
        wavesurferRef.current.setTime(region.start);
        wavesurferRef.current.play();
      }
    }
  };

  const handleStop = () => {
    if (wavesurferRef.current && region) {
      wavesurferRef.current.pause();
      wavesurferRef.current.setTime(region.start);
    }
  };

  const handleZoomIn = () => {
    const currentZoom = zoomLevelRef.current;
    const newZoomLevel = Math.min(currentZoom * 1.5, 10);
    
    zoomLevelRef.current = newZoomLevel;
    setZoomDisplay(Math.round(newZoomLevel * 100));
    
    const basePixelsPerSec = 50;
    const pixelsPerSec = basePixelsPerSec * newZoomLevel;
    wavesurferRef.current?.zoom(pixelsPerSec);
    
    // Center on region if it exists
    if (region && wavesurferRef.current) {
      setTimeout(() => {
        const regionCenter = (region.start + region.end) / 2;
        const scrollPosition = (regionCenter / totalDuration) * wavesurferRef.current.getWrapper().scrollWidth;
        const containerWidth = wavesurferRef.current.getWrapper().clientWidth;
        wavesurferRef.current.getWrapper().scrollLeft = scrollPosition - containerWidth / 2;
      }, 10);
    }
  };

  const handleZoomOut = () => {
    const currentZoom = zoomLevelRef.current;
    const newZoomLevel = Math.max(currentZoom / 1.5, 0.1);
    
    zoomLevelRef.current = newZoomLevel;
    setZoomDisplay(Math.round(newZoomLevel * 100));
    
    const basePixelsPerSec = 50;
    const pixelsPerSec = basePixelsPerSec * newZoomLevel;
    wavesurferRef.current?.zoom(pixelsPerSec);
    
    // Center on region if it exists
    if (region && wavesurferRef.current) {
      setTimeout(() => {
        const regionCenter = (region.start + region.end) / 2;
        const scrollPosition = (regionCenter / totalDuration) * wavesurferRef.current.getWrapper().scrollWidth;
        const containerWidth = wavesurferRef.current.getWrapper().clientWidth;
        wavesurferRef.current.getWrapper().scrollLeft = scrollPosition - containerWidth / 2;
      }, 10);
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Parse time string to seconds - supports formats like "1:30", "90", "0:15"
  const parseTimeToSeconds = (timeStr) => {
    if (!timeStr || timeStr.trim() === '') return null;
    
    const trimmed = timeStr.trim();
    
    // If it contains a colon, parse as mm:ss
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);
        if (!isNaN(minutes) && !isNaN(seconds) && minutes >= 0 && seconds >= 0 && seconds < 60) {
          return minutes * 60 + seconds;
        }
      }
      return null;
    }
    
    // Otherwise parse as seconds
    const seconds = parseFloat(trimmed);
    if (!isNaN(seconds) && seconds >= 0) {
      return seconds;
    }
    
    return null;
  };

  const handleSetRegionStart = () => {
    if (region && regionsRef.current) {
      const newStart = currentTime;
      const currentEnd = region.end;
      
      // Only update if new start is before current end
      if (newStart < currentEnd) {
        regionsRef.current.clearRegions();
        const newRegion = regionsRef.current.addRegion({
          start: newStart,
          end: currentEnd,
          color: 'rgba(79, 156, 249, 0.3)',
          drag: true,
          resize: true,
        });
        setRegion(newRegion);
        regionRef.current = newRegion;
        
        if (onRegionUpdate) {
          onRegionUpdate({
            start: newStart,
            end: currentEnd,
          });
        }
      }
    }
  };

  const handleSetRegionEnd = () => {
    if (region && regionsRef.current) {
      const newEnd = currentTime;
      const currentStart = region.start;
      
      // Only update if new end is after current start
      if (newEnd > currentStart) {
        regionsRef.current.clearRegions();
        const newRegion = regionsRef.current.addRegion({
          start: currentStart,
          end: newEnd,
          color: 'rgba(79, 156, 249, 0.3)',
          drag: true,
          resize: true,
        });
        setRegion(newRegion);
        regionRef.current = newRegion;
        
        if (onRegionUpdate) {
          onRegionUpdate({
            start: currentStart,
            end: newEnd,
          });
        }
      }
    }
  };

  const handleRegionTimeEdit = (type, isEditing) => {
    if (isEditing) {
      setEditingRegion(prev => ({ ...prev, [type]: true }));
      setTempRegionTimes(prev => ({
        ...prev,
        [type]: formatTime(region ? region[type] : 0)
      }));
    } else {
      setEditingRegion(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleRegionTimeChange = (type, value) => {
    setTempRegionTimes(prev => ({ ...prev, [type]: value }));
  };

  const handleRegionTimeConfirm = (type) => {
    if (!region || !regionsRef.current) return;
    
    const timeValue = tempRegionTimes[type];
    if (!timeValue || timeValue.trim() === '') {
      // Empty input, cancel edit
      handleRegionTimeEdit(type, false);
      return;
    }
    
    const newTime = parseTimeToSeconds(timeValue);
    if (newTime === null || newTime < 0 || newTime > totalDuration) {
      // Invalid time, cancel edit
      handleRegionTimeEdit(type, false);
      return;
    }
    
    const currentStart = region.start;
    const currentEnd = region.end;
    let newStart = currentStart;
    let newEnd = currentEnd;
    
    if (type === 'start') {
      newStart = newTime;
      // Ensure start is before end
      if (newStart >= currentEnd) {
        handleRegionTimeEdit(type, false);
        return;
      }
    } else {
      newEnd = newTime;
      // Ensure end is after start
      if (newEnd <= currentStart) {
        handleRegionTimeEdit(type, false);
        return;
      }
    }
    
    // Update the region
    regionsRef.current.clearRegions();
    const newRegion = regionsRef.current.addRegion({
      start: newStart,
      end: newEnd,
      color: 'rgba(79, 156, 249, 0.3)',
      drag: true,
      resize: true,
    });
    setRegion(newRegion);
    regionRef.current = newRegion;
    
    if (onRegionUpdate) {
      onRegionUpdate({
        start: newStart,
        end: newEnd,
      });
    }
    
    handleRegionTimeEdit(type, false);
  };

  const handleRegionTimeKeyDown = (type, e) => {
    if (e.key === 'Enter') {
      handleRegionTimeConfirm(type);
    } else if (e.key === 'Escape') {
      handleRegionTimeEdit(type, false);
    }
  };

  return (
    <div className="waveform-editor">
      <div ref={containerRef} className="waveform-container" />
      
      <div className="controls">
        <div className="controls-row-1">
          <div className="playback-controls">
            <button onClick={handlePlayPause} className="control-button">
              {isPlaying ? '⏸' : '▶'} {isPlaying ? 'Pause' : 'Play Region'}
            </button>
            <button onClick={handleStop} className="control-button">
              ⏹ Stop
            </button>
            <label className="loop-checkbox">
              <input
                type="checkbox"
                checked={isLooping}
                onChange={(e) => setIsLooping(e.target.checked)}
              />
              Loop
            </label>
          </div>
          
          <div className="zoom-controls">
            <button onClick={handleZoomOut} className="zoom-button" title="Show more time (zoom out)">
              −
            </button>
            <span className="zoom-level">
              {zoomDisplay}%
            </span>
            <button onClick={handleZoomIn} className="zoom-button" title="Show less time (zoom in)">
              +
            </button>
          </div>
          
          <div className="region-controls">
            <button 
              onClick={handleSetRegionStart} 
              className="region-button"
              disabled={!region}
              title="Set region start to current position"
            >
              Set Start
            </button>
            <button 
              onClick={handleSetRegionEnd} 
              className="region-button"
              disabled={!region}
              title="Set region end to current position"
            >
              Set End
            </button>
          </div>
        </div>
        
        <div className="controls-row-2">
          <div className="time-display">
            <span>{formatTime(currentTime)}</span>
            <span> / </span>
            <span>{formatTime(duration)}</span>
            {region && (
              <span className="region-info">
                {' '}| Region: 
                {editingRegion.start ? (
                  <input
                    type="text"
                    value={tempRegionTimes.start}
                    onChange={(e) => handleRegionTimeChange('start', e.target.value)}
                    onBlur={() => {
                      // Small delay to allow for click events on buttons
                      setTimeout(() => handleRegionTimeConfirm('start'), 100);
                    }}
                    onKeyDown={(e) => handleRegionTimeKeyDown('start', e)}
                    className="time-input"
                    autoFocus
                    placeholder="0:15"
                  />
                ) : (
                  <span 
                    className="editable-time"
                    onClick={() => handleRegionTimeEdit('start', true)}
                    title="Click to edit start time"
                  >
                    {formatTime(region.start)}
                  </span>
                )}
                {' '} - {' '}
                {editingRegion.end ? (
                  <input
                    type="text"
                    value={tempRegionTimes.end}
                    onChange={(e) => handleRegionTimeChange('end', e.target.value)}
                    onBlur={() => {
                      // Small delay to allow for click events on buttons
                      setTimeout(() => handleRegionTimeConfirm('end'), 100);
                    }}
                    onKeyDown={(e) => handleRegionTimeKeyDown('end', e)}
                    className="time-input"
                    autoFocus
                    placeholder="1:30"
                  />
                ) : (
                  <span 
                    className="editable-time"
                    onClick={() => handleRegionTimeEdit('end', true)}
                    title="Click to edit end time"
                  >
                    {formatTime(region.end)}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaveformEditor;