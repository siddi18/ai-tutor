import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import AtomicRingsLoader from "../components/Loading/AtomicRingsLoader";

export default function Upload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [parsedSyllabus, setParsedSyllabus] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);

  const settings = {
    dots: true,
    infinite: true,
    autoplay: true,
    autoplaySpeed: 3000,
    arrows: false,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
  };

  const images = ["/images/slide1.jpg", "/images/slide2.jpg", "/images/slide3.jpg"];

  const getCurrentUserId = () => {
    return JSON.parse(localStorage.getItem("mongoUser"));
  };

  useEffect(() => {
    // Simulate page loading process
    const loadPageContent = async () => {
      try {
        // Check if user data exists
        const userData = getCurrentUserId();
        if (!userData) {
          console.warn("No user data found");
        }

        // Check for previously uploaded file
        const savedFile = localStorage.getItem("uploadedFile");
        if (savedFile) {
          const parsedFile = JSON.parse(savedFile);
          setFile(parsedFile);
          setSuccess("✅ File restored from local storage.");
        }

        // Simulate any other initial page loading tasks
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate loading time
        
      } catch (error) {
        console.error("Error during page loading:", error);
      } finally {
        // Page is fully loaded
        setPageLoading(false);
      }
    };

    loadPageContent();
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(selected.type)) {
      setError("❌ Only PDF and DOCX files are allowed.");
      setFile(null);
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError("❌ File size must be less than 10MB.");
      setFile(null);
      return;
    }

    const fileData = {
      fileObject: selected,
      name: selected.name,
      size: selected.size,
      type: selected.type,
    };

    setFile(fileData);
    setError("");
    setSuccess("");
    setShowPreview(false);
  };

  const handleUseSamplePDF = async () => {
    try {
      const response = await fetch('/class11_biology_syllabus.pdf');
      const blob = await response.blob();
      const file = new File([blob], 'class11_biology_syllabus.pdf', { type: 'application/pdf' });
      
      const fileData = {
        fileObject: file,
        name: file.name,
        size: file.size,
        type: file.type,
      };

      setFile(fileData);
      setError("");
      setSuccess("✅ Sample syllabus loaded successfully!");
      setShowPreview(false);
    } catch (error) {
      console.error('Error loading sample PDF:', error);
      setError("❌ Failed to load sample PDF. Please try again.");
    }
  };

  const handleDownloadSample = () => {
    const link = document.createElement('a');
    link.href = '/class11_biology_syllabus.pdf';
    link.download = 'class11_biology_syllabus.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpload = async () => {
    if (!file || !file.fileObject) {
      setError("❌ Please select a file before uploading.");
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setSuccess("");

    const userId = getCurrentUserId()?._id;
    if (!userId) {
      setError("❌ User not found. Please login again.");
      setIsUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", file.fileObject);

    // Auto-detect API URL
 
    const API_URL ="https://ai-tutor-1k05.onrender.com/api"

    try {
      console.log("Uploading to:", `${API_URL}/upload-syllabus/${userId}`);
      
      const response = await fetch(
        `${API_URL}/upload-syllabus/${userId}`,
        {
          method: "POST",
          body: formData,
        }
      );

      console.log("Response status:", response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server response:", errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Actual response from backend:", data);

      let syllabus;

      if (data && data.class && data.subjects && typeof data.subjects === 'object') {
        console.log("Detected multi-subject format.");
        syllabus = {
          class: data.class,
          subjects: data.subjects,
        };
      } 
      else if (data && data.class && data.subject && Array.isArray(data.topics)) {
        console.log("Detected single-subject format. Converting for preview.");
        syllabus = {
          class: data.class,
          subjects: {
            [data.subject]: data.topics 
          },
        };
      } 
      else {
        throw new Error("The parsed data from the backend is not in a recognized format.");
      }

      let progressValue = 0;
      const interval = setInterval(() => {
        progressValue += 10;
        setProgress(progressValue);
        if (progressValue >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          localStorage.setItem("uploadedFile", JSON.stringify(file));
          setSuccess(`✅ File "${file.name}" uploaded successfully!`);
          setParsedSyllabus(syllabus);
          setShowPreview(true);
          // Persist the created study plan meta for navigation
          if (data?.syllabusId || data?.studyPlanId) {
            localStorage.setItem(
              'lastStudyPlanMeta',
              JSON.stringify({ syllabusId: data.syllabusId || null, studyPlanId: data.studyPlanId || null })
            );
          }
        }
      }, 100);
    } catch (err) {
      console.error("Error processing file:", err);
      console.error("Full error details:", {
        message: err.message,
        stack: err.stack,
        userId: userId,
        apiUrl: API_URL
      });
      
      // Better error messages for common issues
      let errorMessage = err.message;
      if (err.message.includes('status: 500')) {
        errorMessage = "⚠️ Server error. The parser service may be down or on cold start. Please wait 60 seconds and try again, or try a smaller file.";
      } else if (err.message.includes('unavailable') || err.message.includes('502')) {
        errorMessage = "⏳ Parser service is starting up (cold start). Please wait 30-60 seconds and try again.";
      } else if (err.message.includes('timeout')) {
        errorMessage = "⏱️ PDF too large or processing timeout. Try a smaller file (max 50 pages recommended).";
      } else if (err.message.includes('Failed to fetch')) {
        errorMessage = "🔌 Cannot reach server. Check if backend is running.";
      } else if (err.message.includes('NetworkError') || err.message.includes('network')) {
        errorMessage = "🌐 Network error. Please check your internet connection.";
      } else if (err.message.includes('HTTP error')) {
        errorMessage = `Server error (${err.message}). The parser service might be unavailable on Render. Wait 60 seconds and retry.`;
      }
      
      setError(`❌ ${errorMessage}`);
      setIsUploading(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError("");
    setSuccess("");
    setProgress(0);
    setShowPreview(false);
    setParsedSyllabus(null);
    localStorage.removeItem("uploadedFile");
  };

  const goToStudyPlan = () => {
    const meta = JSON.parse(localStorage.getItem('lastStudyPlanMeta') || '{}');
    if (meta?.syllabusId || meta?.studyPlanId) {
      navigate("/study-plan", { state: { syllabusId: meta.syllabusId, studyPlanId: meta.studyPlanId } });
    } else {
      navigate("/study-plan");
    }
  };

  // Show loading animation only during initial page load
  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AtomicRingsLoader />
          <div className="mt-4 text-lg text-gray-700">Loading Upload Page...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-[calc(100vh-64px)] rounded-xl overflow-hidden">
      {/* Background video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      >
        <source src="/videos/background.mp4" type="video/mp4" />
      </video>

      {/* Overlay */}
      <div className="absolute inset-0 z-10" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}></div>

      {/* Carousel + Upload box */}
      <div className="relative z-20 max-w-6xl mx-auto p-3 sm:p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 items-stretch">
          {/* Carousel - Hidden on mobile */}
          <div className="hidden md:flex rounded-2xl overflow-hidden shadow-xl bg-white bg-opacity-80 backdrop-blur-md h-full">
            <Slider {...settings} className="w-full h-full">
              {images.map((src, index) => (
                <div key={index} className="flex items-center justify-center w-full h-full">
                  <img src={src} alt={`Slide ${index + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </Slider>
          </div>

          {/* Upload Section */}
          <div className="flex flex-col items-center justify-center bg-white/20 backdrop-blur-lg p-4 sm:p-6 md:p-8 rounded-2xl shadow-xl border border-white/30 h-full">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white mb-2">Upload Your Files</h1>
            <p className="text-sm sm:text-base text-white/90 mb-4 sm:mb-6 text-center max-w-md px-2">
              Upload your syllabus or notes (PDF/DOCX). Your files will be stored securely for generating study plans and quizzes.
            </p>

            {/* Sample PDF Section */}
            <div className="w-full max-w-lg mb-3 sm:mb-4 bg-white/10 backdrop-blur border border-white/20 rounded-xl p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl">📄</span>
                  <div>
                    <p className="text-sm sm:text-base font-semibold text-white">Need a sample syllabus?</p>
                    <p className="text-xs text-white/80">Try our Class 11 Biology syllabus</p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleUseSamplePDF}
                    className="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-xs sm:text-sm font-semibold rounded-lg hover:shadow-lg hover:scale-105 transition-all duration-300"
                  >
                    Use Sample
                  </button>
                  <button
                    onClick={handleDownloadSample}
                    className="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 bg-white text-indigo-600 text-xs sm:text-sm font-semibold rounded-lg border-2 border-indigo-500 hover:bg-indigo-50 hover:scale-105 transition-all duration-300"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>

            <div className="w-full max-w-lg px-2 sm:px-0">
              {!file && (
                <label className="flex flex-col items-center justify-center w-full h-40 sm:h-48 md:h-56 border-2 border-dashed border-white/40 rounded-xl cursor-pointer bg-white/10 backdrop-blur hover:border-white/60 hover:bg-white/20 hover:shadow-md transition-all duration-300">
                  <span className="text-4xl sm:text-5xl md:text-6xl mb-2 sm:mb-3">📂</span>
                  <span className="text-sm sm:text-base text-white font-semibold text-center px-4">Click to upload or drag & drop</span>
                  <span className="text-xs sm:text-sm text-white/70 mt-1">(PDF/DOCX only, max 5MB)</span>
                  <input type="file" accept=".pdf,.docx" onChange={handleFileChange} className="hidden" />
                </label>
              )}

              {error && <p className="text-red-400 font-semibold mt-4 text-center bg-red-900/30 backdrop-blur px-4 py-2 rounded-lg border border-red-500/30">{error}</p>}
              {success && <p className="text-green-400 font-semibold mt-4 text-center bg-green-900/30 backdrop-blur px-4 py-2 rounded-lg border border-green-500/30">{success}</p>}

              {file && (
                <div className="mt-4 sm:mt-6 bg-white/10 backdrop-blur-lg rounded-xl shadow-md p-4 sm:p-6 border border-white/20 flex flex-col gap-3 sm:gap-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center rounded-lg bg-indigo-500/30 backdrop-blur text-white font-bold text-sm sm:text-lg flex-shrink-0 border border-indigo-400/30">
                      {file.type === "application/pdf" ? "PDF" : "DOCX"}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm sm:text-base text-white truncate">{file.name}</p>
                      <p className="text-xs sm:text-sm text-white/70">
                        {(file.size / 1024 / 1024).toFixed(2)} MB •{" "}
                        {file.type === "application/pdf" ? "PDF Document" : "Word Document"}
                      </p>
                    </div>
                  </div>

                  {isUploading && (
                    <div className="w-full">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Uploading & Processing...</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          style={{ width: `${progress}%` }}
                          className="bg-gradient-to-r from-indigo-500 to-blue-500 h-3 rounded-full transition-all duration-300"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        ⏳ First upload may take 60-90 seconds (service warm-up)
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 sm:gap-3 self-end mt-2 sm:mt-3">
                    <button
                      onClick={handleUpload}
                      disabled={isUploading}
                      className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold shadow-md flex items-center gap-1 sm:gap-2 transition-all duration-300 ${
                        isUploading
                          ? "bg-gray-300 text-white cursor-not-allowed"
                          : "bg-gradient-to-r from-indigo-500 to-blue-500 text-white hover:shadow-lg hover:scale-105"
                      }`}
                    >
                      ⬆ {isUploading ? "Uploading..." : "Upload"}
                    </button>
                    <button
                      onClick={removeFile}
                      disabled={isUploading}
                      className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold shadow-md flex items-center gap-1 sm:gap-2 transition-all duration-300 ${
                        isUploading
                          ? "bg-gray-200 text-white cursor-not-allowed"
                          : "bg-gradient-to-r from-red-500 to-pink-500 text-white hover:shadow-lg hover:scale-105"
                      }`}
                    >
                      ❌ Remove
                    </button>
                  </div>

                  {success && !isUploading && (
                    <button
                      onClick={goToStudyPlan}
                      className="mt-3 sm:mt-4 w-full bg-green-500 text-white py-2 rounded-lg text-sm sm:text-base font-semibold hover:bg-green-600 transition-all duration-300"
                    >
                      View Study Plan
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Preview Section - Updated with Four Boxes */}
        {showPreview && parsedSyllabus && (
          <div className="mt-6 sm:mt-8 md:mt-12 p-4 sm:p-6 md:p-8 bg-white/20 backdrop-blur-lg rounded-2xl shadow-xl border border-white/30">
            <div className="flex items-center mb-4 sm:mb-6">
              <span className="text-xl sm:text-2xl mr-2 sm:mr-3">📚</span>
              <div>
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">Syllabus Preview</h2>
                {parsedSyllabus.class && (
                  <p className="text-sm sm:text-base text-white/80 font-medium">Class: {parsedSyllabus.class}</p>
                )}
              </div>
            </div>
            
            {/* Four subject boxes in a 2x2 grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
              {/* Physics Box */}
              <div className="bg-blue-500/20 backdrop-blur p-4 sm:p-5 md:p-6 rounded-xl border border-blue-400/30 shadow-sm hover:bg-blue-500/30 transition-all duration-300">
                <div className="flex items-center mb-3 sm:mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500/40 backdrop-blur rounded-lg flex items-center justify-center mr-2 sm:mr-3 border border-blue-400/30">
                    <span className="text-white font-bold text-base sm:text-lg">P</span>
                  </div>
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Physics</h3>
                </div>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm md:text-base text-white/90">
                  {parsedSyllabus.subjects.Physics && parsedSyllabus.subjects.Physics.slice(0, 4).map((topic, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-blue-300 mr-2">•</span>
                      <span>{topic}</span>
                    </li>
                  ))}
                  {(!parsedSyllabus.subjects.Physics || parsedSyllabus.subjects.Physics.length === 0) && (
                    <li className="text-white/60 italic">No physics topics found</li>
                  )}
                </ul>
              </div>

              {/* Math Box */}
              <div className="bg-green-500/20 backdrop-blur p-4 sm:p-5 md:p-6 rounded-xl border border-green-400/30 shadow-sm hover:bg-green-500/30 transition-all duration-300">
                <div className="flex items-center mb-3 sm:mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500/40 backdrop-blur rounded-lg flex items-center justify-center mr-2 sm:mr-3 border border-green-400/30">
                    <span className="text-white font-bold text-base sm:text-lg">M</span>
                  </div>
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Math</h3>
                </div>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm md:text-base text-white/90">
                  {parsedSyllabus.subjects.Math && parsedSyllabus.subjects.Math.slice(0, 4).map((topic, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-green-300 mr-2">•</span>
                      <span>{topic}</span>
                    </li>
                  ))}
                  {(!parsedSyllabus.subjects.Math || parsedSyllabus.subjects.Math.length === 0) && (
                    <li className="text-white/60 italic">No math topics found</li>
                  )}
                </ul>
              </div>

              {/* Chemistry Box */}
              <div className="bg-purple-500/20 backdrop-blur p-4 sm:p-5 md:p-6 rounded-xl border border-purple-400/30 shadow-sm hover:bg-purple-500/30 transition-all duration-300">
                <div className="flex items-center mb-3 sm:mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-500/40 backdrop-blur rounded-lg flex items-center justify-center mr-2 sm:mr-3 border border-purple-400/30">
                    <span className="text-white font-bold text-base sm:text-lg">C</span>
                  </div>
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Chemistry</h3>
                </div>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm md:text-base text-white/90">
                  {parsedSyllabus.subjects.Chemistry && parsedSyllabus.subjects.Chemistry.slice(0, 4).map((topic, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-purple-300 mr-2">•</span>
                      <span>{topic}</span>
                    </li>
                  ))}
                  {(!parsedSyllabus.subjects.Chemistry || parsedSyllabus.subjects.Chemistry.length === 0) && (
                    <li className="text-white/60 italic">No chemistry topics found</li>
                  )}
                </ul>
              </div>

              {/* Biology Box */}
              <div className="bg-red-500/20 backdrop-blur p-4 sm:p-5 md:p-6 rounded-xl border border-red-400/30 shadow-sm hover:bg-red-500/30 transition-all duration-300">
                <div className="flex items-center mb-3 sm:mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-500/40 backdrop-blur rounded-lg flex items-center justify-center mr-2 sm:mr-3 border border-red-400/30">
                    <span className="text-white font-bold text-base sm:text-lg">B</span>
                  </div>
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Biology</h3>
                </div>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm md:text-base text-white/90">
                  {parsedSyllabus.subjects.Biology && parsedSyllabus.subjects.Biology.slice(0, 4).map((topic, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-red-300 mr-2">•</span>
                      <span>{topic}</span>
                    </li>
                  ))}
                  {(!parsedSyllabus.subjects.Biology || parsedSyllabus.subjects.Biology.length === 0) && (
                    <li className="text-white/60 italic">No biology topics found</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}