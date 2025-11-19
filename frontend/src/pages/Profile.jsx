import React, { useState, useEffect } from "react";
import ProfileForm from "../components/profileData/ProfileForm";
import ProfileDisplay from "../components/profileData/ProfileDisplay";
import profileBg from "/images/profile_bg_4.jpg";
import AtomicRingsLoader from "../components/Loading/AtomicRingsLoader";
import { auth } from "../services/firebaseOffline";

const Profile = () => {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  // Get the current user's UID (you might need to adjust this based on your auth setup)
  const getStoredMongoUser = () => {
    try {
      return JSON.parse(localStorage.getItem("mongoUser"));
    } catch {
      return null;
    }
  };

  // Page loading effect
  useEffect(() => {
    const loadPageContent = async () => {
      try {
        // Check if user data exists
        const userData = getStoredMongoUser();
        if (!userData) {
          console.warn("No user data found");
        }

        // Simulate any initial page loading tasks
        await new Promise(resolve => setTimeout(resolve, 300)); // Minimal loading time
        
      } catch (error) {
        console.error("Error during page loading:", error);
      } finally {
        // Page is fully loaded
        setPageLoading(false);
      }
    };

    loadPageContent();
  }, []);

  // Fetch user profile data
  const fetchProfileData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const stored = getStoredMongoUser();
      console.log("📋 Fetching profile data. Stored user:", stored);

      // Prefer stored Mongo user id if available
      if (stored?._id) {
        console.log("🔍 Fetching user by MongoDB ID:", stored._id);
        const response = await fetch(`http://localhost:5000/api/users/${stored._id}`);
        if (!response.ok) {
          console.error("❌ Failed to fetch by ID, status:", response.status);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("✅ Profile data fetched by ID:", data);
        setProfileData(data);
        setError(null);
        return;
      }

      // Fallback: use Firebase ID token to query /me
      console.log("🔑 No stored ID, trying Firebase auth token...");
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        console.log("🔍 Using Firebase token to fetch user");
        const response = await fetch("http://localhost:5000/api/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          console.error("❌ Failed to fetch by token, status:", response.status);
          const errorText = await response.text();
          console.error("❌ Error response:", errorText);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("✅ Profile data fetched by token:", data);
        // Cache for later
        localStorage.setItem("mongoUser", JSON.stringify(data));
        setProfileData(data);
        setError(null);
        return;
      }

      // If we reach here, we have no way to identify the user
      console.error("❌ No stored user and no Firebase token available");
      setError("You are not logged in. Please sign in again.");
      setProfileData(null);
      
    } catch (err) {
      console.error("❌ Error fetching profile data:", err);
      setError("Failed to load profile data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  // Handle form submission (update profile)
  const handleFormSubmit = async (data) => {
    try {
      setLoading(true);
      const stored = getStoredMongoUser();
      console.log("stored: ",stored);
      let response;
      if (stored?._id) {
        // Update by Mongo _id if we have it cached
        response = await fetch(`http://localhost:5000/api/users/${stored._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      } else {
        // Fallback: update via /me using Firebase token
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          throw new Error("Not authenticated");
        }
        response = await fetch("http://localhost:5000/api/users/me", {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        });
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const updatedData = await response.json();
      setProfileData(updatedData);
      // Keep local cache in sync
      localStorage.setItem("mongoUser", JSON.stringify(updatedData));
      setIsEditing(false);
      setError(null);
    } catch (err) {
      console.error("Error updating profile:", err);
      setError("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  // Handle editing the profile
  const handleEdit = () => {
    setIsEditing(true);
  };

  // Handle cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  // Show loading animation only during initial page load
  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AtomicRingsLoader />
          <div className="mt-4 text-lg text-gray-700">Loading Profile Page...</div>
        </div>
      </div>
    );
  }

  if (loading && !profileData) {
    return (
      <div 
        className="h-screen w-full flex items-center justify-center bg-cover bg-center"
        style={{ backgroundImage: `url(${profileBg})` }}
      >
        <div className="text-center">
          <AtomicRingsLoader />
          <div className="mt-4 text-white text-xl">Loading profile data...</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen w-full flex items-start justify-end bg-cover bg-center overflow-y-auto"
      style={{ backgroundImage: `url(${profileBg})` }}
    >
      {/* Right Side - Glassmorphism Form / Profile Display */}
      <div className="w-full md:w-1/2 lg:w-2/5 flex justify-center py-0 mr-1">
        <div className="w-11/12 md:w-5/6 lg:w-3/2 rounded-3xl bg-white/70 border border-white/40 shadow-2xl p-1 px-1 mr-2 min-h-[80vh]">
          {error && (
            <div className="p-4 mb-4 text-red-700 bg-red-100 rounded-lg">
              {error}
            </div>
          )}
          
          {isEditing || !profileData ? (
            <ProfileForm 
              onSubmit={handleFormSubmit} 
              onCancel={profileData ? handleCancelEdit : null}
              initialData={profileData}
              loading={loading}
            />
          ) : (
            <ProfileDisplay 
              profileData={profileData} 
              onEdit={handleEdit} 
              loading={loading}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;