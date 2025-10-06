import { useState, useRef } from 'react';
import {
  ReactCompareSlider,
  ReactCompareSliderImage
} from 'react-compare-slider';
import './App.css';

// Cloudinary Configuration (using Pollinations account)
const CLOUDINARY_CLOUD_NAME = 'pollinations';
const CLOUDINARY_UPLOAD_PRESET = 'pollinations-image';
const CLOUDINARY_API_KEY = '939386723511927';

function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [annotatedImageUrl, setAnnotatedImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef(null);

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Process uploaded file
  const processFile = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPG, PNG, etc.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }

    setSelectedImage(file);
    const url = URL.createObjectURL(file);
    setSelectedImageUrl(url);
    setAnnotatedImageUrl(''); // Reset previous results
  };

  // Handle drag and drop
  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    
    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Upload image to Cloudinary
  const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    // Add API key if available
    if (CLOUDINARY_API_KEY) {
      formData.append('api_key', CLOUDINARY_API_KEY);
    }
    
    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: formData
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Cloudinary error:', errorData);
        throw new Error(`Upload failed: ${errorData.error?.message || 'Unknown error'}`);
      }
      
      const data = await response.json();
      return data.secure_url;
    } catch (error) {
      console.error('Cloudinary upload failed:', error);
      throw error;
    }
  };

  // Generate annotated image using Pollinations API
  const handleAnalyze = async () => {
    if (!selectedImage) {
      alert('Please upload an image first!');
      return;
    }

    setIsLoading(true);
    setUploadStatus('Uploading image to Cloudinary...');

    try {
      // Upload image to Cloudinary to get a public URL
      const uploadedImageUrl = await uploadToCloudinary(selectedImage);
      console.log('Image uploaded to Cloudinary:', uploadedImageUrl);
      
      setUploadStatus('Generating calorie annotations with AI...');
      
      // Create prompt for calorie annotation
      const prompt = encodeURIComponent(
        `Analyze this food image and add professional calorie annotations. 
        Add clear labels with arrows pointing to each food item showing "Item Name - XXX kcal".
        Include portion sizes and total meal calories at the bottom.
        Use a modern nutrition label aesthetic with semi-transparent boxes and clear typography.
        Make it look like a professional dietitian's analysis.`
      );

      // Build the API URL with the uploaded image
      // Using nanobanana model for image-to-image generation with referrer for tracking
      const apiUrl = `https://image.pollinations.ai/prompt/${prompt}?image=${encodeURIComponent(uploadedImageUrl)}&width=1024&height=1024&model=nanobanana&enhance=true&nologo=true&referrer=pppp`;

      console.log('Pollinations API URL:', apiUrl);
      
      // Set the annotated image URL
      setAnnotatedImageUrl(apiUrl);
      setUploadStatus('');
      
    } catch (error) {
      console.error('Error analyzing image:', error);
      alert(`Failed to analyze image: ${error.message}`);
      setUploadStatus('');
    } finally {
      setIsLoading(false);
    }
  };

  // Download annotated image
  const handleDownload = async () => {
    if (!annotatedImageUrl) return;

    try {
      const response = await fetch(annotatedImageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `calorie-annotated-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download image. Please try right-clicking and saving manually.');
    }
  };

  // Remove selected image
  const handleRemoveImage = () => {
    setSelectedImage(null);
    setSelectedImageUrl('');
    setAnnotatedImageUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="app">
      <div className="container">
        {/* Header */}
        <header className="header">
          <h1>
            <span className="emoji-bounce">🍕</span>
            Food Calorie Annotator
            <span className="emoji-bounce">✨</span>
          </h1>
          <p>Upload a food image and get AI-powered calorie annotations instantly!</p>
          <p className="intro-text">
            Powered by <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer">Pollinations.AI</a> 🐝
            {' | '}
            <a href="https://github.com/pollinations/pollinations" target="_blank" rel="noopener noreferrer">Open Source</a> 🌟
          </p>
        </header>

        {/* Main Card */}
        <div className="main-card">
          {/* Upload Section */}
          <section className="upload-section">
            <h2>📸 Upload Food Image</h2>
            
            {!selectedImage ? (
              <div
                className={`upload-zone ${isDragging ? 'dragover' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="upload-icon">🍽️</div>
                <h3>Click to Upload or Drag & Drop</h3>
                <p>Support JPG, PNG (Max 5MB)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="file-input"
                  accept="image/*"
                  onChange={handleFileSelect}
                />
              </div>
            ) : (
              <div className="preview-section">
                <div className="preview-image-container">
                  <img 
                    src={selectedImageUrl} 
                    alt="Selected food" 
                    className="preview-image"
                  />
                  <button 
                    className="remove-image-btn"
                    onClick={handleRemoveImage}
                    title="Remove image"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Action Buttons */}
          {selectedImage && (
            <div className="action-section">
              <button
                className="analyze-btn"
                onClick={handleAnalyze}
                disabled={isLoading}
              >
                <span>{isLoading ? '⏳' : '🔍'}</span>
                <span>{isLoading ? 'Analyzing...' : 'Analyze Calories'}</span>
              </button>
              
              {annotatedImageUrl && (
                <button
                  className="download-btn"
                  onClick={handleDownload}
                >
                  <span>💾</span>
                  <span>Download Result</span>
                </button>
              )}
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>{uploadStatus || '🤖 AI is analyzing your food and calculating calories...'}</p>
            </div>
          )}

          {/* Results Section */}
          {annotatedImageUrl && !isLoading && (
            <section className="results-section">
              <h2>🎉 Calorie Analysis Complete!</h2>
              
              {/* Before/After Comparison Slider */}
              <div className="comparison-container">
                <div className="comparison-label">
                  👈 Drag the slider to compare Before & After
                </div>
                <div className="slider-container">
                  <ReactCompareSlider
                    itemOne={
                      <ReactCompareSliderImage
                        src={selectedImageUrl}
                        alt="Original food image"
                      />
                    }
                    itemTwo={
                      <ReactCompareSliderImage
                        src={annotatedImageUrl}
                        alt="Annotated with calories"
                      />
                    }
                    position={50}
                    style={{
                      height: '500px',
                      width: '100%',
                    }}
                  />
                </div>
              </div>

              {/* Side-by-Side Grid View */}
              <div className="image-grid">
                <div className="image-card">
                  <h3>📷 Original Image</h3>
                  <img src={selectedImageUrl} alt="Original" />
                </div>
                <div className="image-card">
                  <h3>🏷️ Annotated Result</h3>
                  <img src={annotatedImageUrl} alt="Annotated" />
                </div>
              </div>

              {/* Nutrition Summary (Mock data for demo) */}
              <div className="nutrition-summary">
                <h3>📊 Estimated Nutrition Breakdown</h3>
                <div className="nutrition-grid">
                  <div className="nutrition-item">
                    <div className="label">Total Calories</div>
                    <div className="value">~650</div>
                    <div className="unit">kcal</div>
                  </div>
                  <div className="nutrition-item">
                    <div className="label">Protein</div>
                    <div className="value">~25</div>
                    <div className="unit">grams</div>
                  </div>
                  <div className="nutrition-item">
                    <div className="label">Carbs</div>
                    <div className="value">~75</div>
                    <div className="unit">grams</div>
                  </div>
                  <div className="nutrition-item">
                    <div className="label">Fats</div>
                    <div className="value">~30</div>
                    <div className="unit">grams</div>
                  </div>
                </div>
                <p style={{ marginTop: '1.5rem', opacity: 0.9, fontSize: '0.9rem' }}>
                  ℹ️ Note: Values are AI-estimated and may vary based on preparation and portion sizes
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
