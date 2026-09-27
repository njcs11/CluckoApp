import React, { createContext, useContext, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const DetectContext = createContext(null);

export function DetectProvider({ children }) {
  const [capturedImage, setCapturedImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [camError, setCamError] = useState(false);
  const [scanModule, setScanModule] = useState('auto');
  const [gradcamLoading, setGradcamLoading] = useState(false);
  const [gradcamData, setGradcamData] = useState(null);

  const analyze = useCallback(async (imageToAnalyze = null, moduleToUse = null) => {
    const targetImage = (typeof imageToAnalyze === 'string' && imageToAnalyze ? imageToAnalyze : null) || capturedImage;
    const targetModule = (typeof moduleToUse === 'string' && moduleToUse ? moduleToUse : null) || scanModule;

    if (!targetImage) return;

    setLoading(true);
    setGradcamData(null);
    try {
      const { data } = await axios.post('/api/detect', {
        image: targetImage,
        module: targetModule
      });
      setResult(data);
      if (data.rejected) {
        toast.error('Detection rejected — see details below');
      } else {
        toast.success(`Diagnosis complete: ${data.top_prediction?.disease_name || 'Processed'}`);
      }
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || 'Detection failed';
      toast.error(msg);
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
