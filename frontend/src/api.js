import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const downloadAudio = async (url) => {
  const response = await api.post('/download', { url });
  return response.data;
};

export const getTaskStatus = async (taskId) => {
  const response = await api.get(`/status/${taskId}`);
  return response.data;
};

export const processAudio = async (params) => {
  const response = await api.post('/process', params, {
    responseType: 'blob',
  });
  return response.data;
};

export const getAudioUrl = (taskId) => {
  return `${API_BASE_URL}/audio/${taskId}`;
};

export default api;