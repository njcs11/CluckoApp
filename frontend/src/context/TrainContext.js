import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const TrainContext = createContext(null);

const DEFAULT_MODULE_STATE = {
  status: 'idle', // 'idle' | 'running' | 'completed' | 'failed'
  progress: 0,
  stage: 'Idle',
  message: '',
  logs: [],
  result: null,
  error: null
};

export function TrainProvider({ children }) {
  const [trainStatus, setTrainStatus] = useState({
    eye: { ...DEFAULT_MODULE_STATE },
    wing: { ...DEFAULT_MODULE_STATE }
  });

  const pollingRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/train/status');
      if (data && data.eye && data.wing) {
        setTrainStatus(prev => {
          // Check if status just transitioned from running to completed
          if (prev.eye.status === 'running' && data.eye.status === 'completed') {
            toast.success(`👁️ Eye model training completed! (${data.eye.result?.train_accuracy || 0}%)`);
          } else if (prev.eye.status === 'running' && data.eye.status === 'failed') {
            toast.error(`❌ Eye model training failed: ${data.eye.error}`);
          }

          if (prev.wing.status === 'running' && data.wing.status === 'completed') {
            toast.success(`🪶 Wing model training completed! (${data.wing.result?.train_accuracy || 0}%)`);
          } else if (prev.wing.status === 'running' && data.wing.status === 'failed') {
            toast.error(`❌ Wing model training failed: ${data.wing.error}`);
          }

          return data;
        });
      }
    } catch (err) {
      console.warn('Could not fetch train status:', err.message);
    }
  }, []);

  // Fetch status on mount
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const isAnyTrainingRunning = trainStatus.eye.status === 'running' || trainStatus.wing.status === 'running';

  // Dynamic Polling: poll faster when active training is happening
  useEffect(() => {
    if (isAnyTrainingRunning) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(fetchStatus, 1200);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isAnyTrainingRunning, fetchStatus]);

  // Prevent accidental tab closing or reload when training is running
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isAnyTrainingRunning) {
        e.preventDefault();
        e.returnValue = 'Model training is currently active. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnyTrainingRunning]);

  const startTraining = async (module, hyperparameters = {}) => {
    if (trainStatus[module]?.status === 'running') {
      toast.error(`${module.toUpperCase()} training is already in progress`);
      return;
    }

    try {
      setTrainStatus(prev => ({
        ...prev,
        [module]: {
          ...prev[module],
          status: 'running',
          progress: 5,
          stage: 'Initializing',
          message: 'Starting training background thread...',
          logs: [`[${new Date().toLocaleTimeString()}] Requested ${module} model training...`],
          error: null
        }
      }));

      const { data } = await axios.post('/api/train', {
        module,
        epochs: hyperparameters.epochs || 10,
        batch_size: hyperparameters.batch_size || 16,
        learning_rate: hyperparameters.learning_rate || 0.0001
      });

      if (data.success) {
        toast.success(`🚀 Started ${module.toUpperCase()} model training in background!`);
        fetchStatus();
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to start training';
      setTrainStatus(prev => ({
        ...prev,
        [module]: {
          ...prev[module],
          status: 'failed',
          error: msg,
          stage: 'Failed',
          message: msg
        }
      }));
      toast.error(msg);
    }
  };

  const resetTraining = async (module) => {
    try {
      await axios.post('/api/train/reset', { module });
      setTrainStatus(prev => ({
        ...prev,
        [module]: { ...DEFAULT_MODULE_STATE }
      }));
      toast.success(`Reset ${module} training state`);
    } catch (err) {
      toast.error('Could not reset training');
    }
  };

  return (
    <TrainContext.Provider
      value={{
        trainStatus,
        isAnyTrainingRunning,
        startTraining,
        resetTraining,
        refreshStatus: fetchStatus
      }}
    >
      {children}
    </TrainContext.Provider>
  );
}

export function useTrain() {
  const context = useContext(TrainContext);
  if (!context) {
    throw new Error('useTrain must be used within a TrainProvider');
  }
  return context;
}
