import { useState, useEffect, useRef, useCallback } from 'react';

// TypeScript declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function useSpeechRecognition(language: string) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const isSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  
  const recognitionRef = useRef<any>(null);
  const onFinalizeRef = useRef<(text: string) => void>();

  useEffect(() => {
    if (!isSupported) {
      setError("Speech Recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let interim = '';
      let finalStr = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalStr += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      setInterimTranscript(interim);
      if (finalStr) {
        setFinalTranscript((prev) => {
          const newText = prev ? prev + ' ' + finalStr : finalStr;
          return newText;
        });
        if (onFinalizeRef.current) {
          onFinalizeRef.current(finalStr);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone permissions.');
        setIsListening(false);
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart if it was supposed to be listening
      if (isListening && !error) {
        try {
          recognition.start();
        } catch(e) {
          console.error("Failed to restart recognition", e);
        }
      }
    };

    return () => {
      recognition.stop();
    };
  }, [language, isListening, error, isSupported]);

  const startListening = useCallback(() => {
    if (!isSupported) return;
    setError(null);
    setIsListening(true);
    setFinalTranscript('');
    setInterimTranscript('');
    try {
      recognitionRef.current?.start();
    } catch(e) {}
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (!isSupported) return;
    setIsListening(false);
    recognitionRef.current?.stop();
  }, [isSupported]);

  const setOnFinalize = useCallback((fn: (text: string) => void) => {
    onFinalizeRef.current = fn;
  }, []);

  return {
    isSupported,
    isListening,
    startListening,
    stopListening,
    interimTranscript,
    finalTranscript,
    setOnFinalize,
    error
  };
}
