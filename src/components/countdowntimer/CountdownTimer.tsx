import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { display } from 'html2canvas/dist/types/css/property-descriptors/display';

const CountdownTimer = ({ startTime }) => {
  // Convert minutes to milliseconds
  const initialTime = startTime * 60 * 1000;
  
  // State management
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);

  // Handle countdown progression
  useEffect(() => {
    let intervalId;

    if (isRunning && timeLeft > 0) {
      intervalId = setInterval(() => {
        setTimeLeft((prevTime) => prevTime - 1000);
      }, 1000);
    } else if (timeLeft <= 0) {
      setIsRunning(false);
    }

    return () => clearInterval(intervalId);
  }, [isRunning, timeLeft]);

  // Reset timer when startTime changes
  useEffect(() => {
    setTimeLeft(initialTime);
    setIsRunning(false);
  }, [startTime]);

  // Format milliseconds to MM:SS
  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if(isRunning){
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }else{
        return `--:--`; 
    }
  };

  // Control functions
  const toggleTimer = () => setIsRunning(!isRunning);
  
  const resetTimer = () => {
    setTimeLeft(initialTime);
    setIsRunning(false);
  };

  return (
    <div className="countdown-timer">
      <div style={{marginTop: '3px'}}>{formatTime(timeLeft)}</div>
      
      <div className="timer-controls">
        <button id='countDownStartBtn' style={{display: 'none'}} onClick={toggleTimer}>
          {isRunning ? 'Pause' : 'Start'}
        </button>
        <button  id='countDownResetBtn'  style={{display: 'none'}} onClick={resetTimer}>Reset</button>
      </div>
    </div>
  );
};

CountdownTimer.propTypes = {
  startTime: PropTypes.number.isRequired,
};

export default CountdownTimer;