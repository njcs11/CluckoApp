import React, { createContext, useContext, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const DetectContext = createContext(null);

export function DetectProvider({ children }) {
  const [capturedImage, setCapturedImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [camError, setCamError] = useState(false);
  const [scanModule, setScanModule] = useState('eye');
  const [gradcamLoading, setGradcamLoading] = useState(false);
  const [gradcamData, setGradcamData] = useState(null);

  // Pre-warm the backend AI models in the background when the app loads
  React.useEffect(() => {
    axios.get('/api/warmup').catch(() => {});
  }, []);

  const analyze = useCallback(async (imageToAnalyze = null, moduleToUse = null) => {
    const targetImage = (typeof imageToAnalyze === 'string' && imageToAnalyze ? imageToAnalyze : null) || capturedImage;
    const targetModule = (typeof moduleToUse === 'string' && moduleToUse ? moduleToUse : null) || scanModule;

    if (!targetImage) return;

    setLoading(true);
    setGradcamData(null);
    const toastId = toast.loading('Analyzing image with MobileNetV2 Deep Learning...');
    try {
      const { data } = await axios.post('/api/detect', {
        image: targetImage,
        module: targetModule
      }, { timeout: 65000 });
      setResult(data);
      if (data.rejected) {
        toast.error('Detection rejected — see details below', { id: toastId });
      } else {
        toast.success(`Diagnosis complete: ${data.top_prediction?.disease_name || 'Processed'}`, { id: toastId });
      }
      return data;
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        // Cold-start retry: cloud container was waking up, retry seamlessly
        try {
          toast.loading('AI server is waking up on the cloud. Re-evaluating now...', { id: toastId });
          const { data } = await axios.post('/api/detect', {
            image: targetImage,
            module: targetModule
          }, { timeout: 65000 });
          setResult(data);
          if (data.rejected) {
            toast.error('Detection rejected — see details below', { id: toastId });
          } else {
            toast.success(`Diagnosis complete: ${data.top_prediction?.disease_name || 'Processed'}`, { id: toastId });
          }
          return data;
        } catch (retryErr) {
          const retryMsg = retryErr.response?.data?.error || 'AI server cold start timed out. Please try once more.';
          toast.error(retryMsg, { id: toastId });
          return;
        }
      }
      const msg = err.response?.data?.error || 'Detection failed';
      toast.error(msg, { id: toastId });
    } finally {
      setLoading(false);
    }
  }, [capturedImage, scanModule]);

  const handleViewGradcam = useCallback(async () => {
    if (!capturedImage) return;
    const targetModule = scanModule !== 'auto'
      ? scanModule
      : (result?.module === 'wing' ? 'wing' : 'eye');

    setGradcamLoading(true);
    try {
      const { data } = await axios.post('/api/gradcam', {
        image: capturedImage,
        module: targetModule
      });
      setGradcamData(data);
      toast.success('AI focus heatmap generated!');
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to generate Grad-CAM visualization';
      toast.error(msg);
    } finally {
      setGradcamLoading(false);
    }
  }, [capturedImage, scanModule, result]);

  const resetDetection = useCallback(() => {
    setCapturedImage(null);
    setResult(null);
    setGradcamData(null);
    setGradcamLoading(false);
  }, []);

  return (
    <DetectContext.Provider
      value={{
        capturedImage,
        setCapturedImage,
        result,
        setResult,
        loading,
        setLoading,
        camError,
        setCamError,
        scanModule,
        setScanModule,
        gradcamLoading,
        setGradcamLoading,
        gradcamData,
        setGradcamData,
        analyze,
        handleViewGradcam,
        resetDetection
      }}
    >
      {children}
    </DetectContext.Provider>
  );
}

export function useDetect() {
  const context = useContext(DetectContext);
  if (!context) {
    throw new Error('useDetect must be used within a DetectProvider');
  }
  return context;
}
