// src/pages/LoginRegister.jsx
import { syncUserWithMongoDB } from "../services/firebaseOffline";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TextField,
  Button,
  Typography,
  Tabs,
  Tab,
  IconButton,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  Snackbar,
  Alert,
  CircularProgress,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { FcGoogle } from "react-icons/fc";

import {
  registerWithEmail,
  loginWithEmail,
  loginWithGoogle,
  sendPasswordReset,
  getErrorMessage,
} from "../services/firebaseOffline";
import ImageCarousel from "../components/LoginComponents/ImageCarousel";

const LoginRegister = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (activeTab === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = "First name is required";
      if (!formData.lastName.trim()) newErrors.lastName = "Last name is required";
      if (!formData.confirmPassword) newErrors.confirmPassword = "Please confirm your password";
      if (formData.password !== formData.confirmPassword)
        newErrors.confirmPassword = "Passwords do not match";
    }
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!formData.password) newErrors.password = "Password is required";
    if (activeTab === 1 && formData.password && !passwordRegex.test(formData.password)) {
      newErrors.password =
        "Password must be at least 8 characters with uppercase, lowercase, number, and special character";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const showSnackbar = (message, severity = "info") => {
    setSnackbar({ open: true, message, severity });
  };

  // 🔑 Handle login/signup
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setErrors({}); // Clear previous errors
    
    try {
      if (activeTab === 0) {
        // LOGIN
        console.log("Attempting login with:", formData.email);
        const userCredential = await loginWithEmail(formData.email, formData.password);
        console.log("✅ Login successful:", userCredential.user);
        
        showSnackbar("🎉 Login successful! Redirecting...", "success");
        setTimeout(() => navigate("/profile"), 500);
      } else {
        // SIGNUP
        console.log("Attempting registration with:", formData.email);
        const userCredential = await registerWithEmail(
          formData.firstName,
          formData.lastName,
          formData.email,
          formData.password
        );
        console.log("✅ Registration successful:", userCredential.user);
        
        const displayName =
          userCredential.user.displayName ||
          `${formData.firstName} ${formData.lastName}` ||
          userCredential.user.email;

        showSnackbar(`🎉 Account created successfully! Welcome, ${displayName}`, "success");
        
        setTimeout(() => {
          navigate("/profile");
        }, 1500);
      }
    } catch (error) {
      console.error("Authentication error:", error);
      const errorMessage = getErrorMessage(error.code || error.message);
      showSnackbar(errorMessage, "error");
      
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        setErrors({ email: "Invalid credentials", password: "Invalid credentials" });
      } else if (error.code === "auth/email-already-in-use") {
        setErrors({ email: "This email is already registered" });
      } else if (error.code === "auth/weak-password") {
        setErrors({ password: "Password is too weak" });
      } else if (error.code === "auth/invalid-email") {
        setErrors({ email: "Please enter a valid email address" });
      }
    } finally {
      setLoading(false);
    }
  };

  // 🔑 Handle Google Sign-In
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrors({});
    
    try {
      console.log("Attempting Google sign-in");
      const result = await loginWithGoogle();
      console.log("Google sign-in successful:", result.user);
      
      const mongoUser = result.mongoUser;
      const displayName = result.user.displayName || result.user.email || "User";
      
      if (mongoUser) {
        console.log("✅ MongoDB user ready:", mongoUser);
        showSnackbar(`🎉 Google sign-in successful! Welcome, ${displayName}`, "success");
        setTimeout(() => navigate("/profile"), 500);
      } else {
        console.error("⚠️ MongoDB sync returned null");
        showSnackbar(`⚠️ Google sign-in successful, but profile sync failed. Please try refreshing.`, "warning");
        setTimeout(() => navigate("/profile"), 1000);
      }
    } catch (error) {
      console.error("❌ Google sign-in error:", error);
      if (error.code !== "auth/popup-closed-by-user") {
        const errorMessage = getErrorMessage(error.code);
        showSnackbar(errorMessage, "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      showSnackbar("Please enter your email address first", "warning");
      return;
    }
    
    try {
      console.log("Sending password reset to:", formData.email);
      await sendPasswordReset(formData.email);
      showSnackbar("✅ Password reset email sent! Check your inbox.", "success");
    } catch (error) {
      console.error("Password reset error:", error);
      const errorMessage = getErrorMessage(error.code);
      showSnackbar(errorMessage, "error");
    }
  };

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4 overflow-hidden fixed inset-0">
      <div className="flex flex-col lg:flex-row w-full max-w-6xl h-[90vh] shadow-xl rounded-2xl bg-white overflow-hidden">
        {/* Left side - Image carousel (Hidden on mobile) */}
        <div className="hidden lg:block lg:w-1/2 h-full">
          <ImageCarousel />
        </div>

        {/* Right side - Auth form */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center p-6 sm:p-8 lg:p-12 h-full overflow-y-auto">
          <div className="max-w-md mx-auto w-full flex flex-col justify-center">
            {/* Mobile Logo - Visible only on small screens */}
            <div className="lg:hidden mb-6 text-center">
              <div className="inline-block bg-green-600 text-white rounded-lg px-5 py-2 shadow-md mb-4">
                <h2 className="font-bold text-xl">AI Tutor</h2>
              </div>
            </div>
            
            <Typography variant="h4" className="font-bold text-slate-800 mb-2 text-center text-2xl sm:text-3xl lg:text-4xl">
              Welcome to AI Tutor
            </Typography>
            <Typography variant="body1" className="text-slate-600 mb-4 sm:mb-6 text-center text-sm sm:text-base">
              {activeTab === 0 ? "Sign in to your account" : "Create your account"}
            </Typography>

            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              className="mb-4 sm:mb-6"
              centered
              sx={{
                "& .MuiTab-root": { 
                  textTransform: "none", 
                  fontSize: { xs: "0.875rem", sm: "1rem" }, 
                  fontWeight: 600,
                  minWidth: { xs: "120px", sm: "160px" }
                },
                "& .MuiTabs-indicator": { backgroundColor: "#2FA86A" },
              }}
            >
              <Tab label="Sign In" />
              <Tab label="Sign Up" />
            </Tabs>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {activeTab === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <TextField
                    label="First Name"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    error={!!errors.firstName}
                    helperText={errors.firstName}
                    fullWidth
                    variant="outlined"
                    size="small"
                    sx={{ 
                      '& .MuiInputBase-root': { fontSize: { xs: '0.9rem', sm: '1rem' } },
                      '& .MuiInputLabel-root': { fontSize: { xs: '0.9rem', sm: '1rem' } }
                    }}
                  />
                  <TextField
                    label="Last Name"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    error={!!errors.lastName}
                    helperText={errors.lastName}
                    fullWidth
                    variant="outlined"
                    size="small"
                    sx={{ 
                      '& .MuiInputBase-root': { fontSize: { xs: '0.9rem', sm: '1rem' } },
                      '& .MuiInputLabel-root': { fontSize: { xs: '0.9rem', sm: '1rem' } }
                    }}
                  />
                </div>
              )}

              <TextField
                label="Email Address"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                error={!!errors.email}
                helperText={errors.email}
                fullWidth
                variant="outlined"
                size="small"
                sx={{ 
                  '& .MuiInputBase-root': { fontSize: { xs: '0.9rem', sm: '1rem' } },
                  '& .MuiInputLabel-root': { fontSize: { xs: '0.9rem', sm: '1rem' } }
                }}
              />

              <TextField
                label="Password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                error={!!errors.password}
                helperText={errors.password}
                fullWidth
                variant="outlined"
                size="small"
                sx={{ 
                  '& .MuiInputBase-root': { fontSize: { xs: '0.9rem', sm: '1rem' } },
                  '& .MuiInputLabel-root': { fontSize: { xs: '0.9rem', sm: '1rem' } }
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              {activeTab === 1 && (
                <TextField
                  label="Confirm Password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                  error={!!errors.confirmPassword}
                  helperText={errors.confirmPassword}
                  fullWidth
                  variant="outlined"
                  size="small"
                  sx={{ 
                    '& .MuiInputBase-root': { fontSize: { xs: '0.9rem', sm: '1rem' } },
                    '& .MuiInputLabel-root': { fontSize: { xs: '0.9rem', sm: '1rem' } }
                  }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          edge="end"
                          size="small"
                        >
                          {showConfirmPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              )}

              {activeTab === 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        sx={{ color: "#2FA86A" }}
                      />
                    }
                    label={<span className="text-sm sm:text-base">Remember me</span>}
                  />
                  <Button
                    variant="text"
                    onClick={handleForgotPassword}
                    sx={{
                      color: "#2FA86A",
                      textTransform: "none",
                      fontSize: { xs: "0.875rem", sm: "1rem" },
                      padding: { xs: "4px 8px", sm: "6px 16px" },
                      justifyContent: { xs: "flex-start", sm: "center" },
                      "&:hover": { backgroundColor: "rgba(47, 168, 106, 0.04)" },
                    }}
                  >
                    Forgot password?
                  </Button>
                </div>
              )}

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                  backgroundColor: "#2FA86A",
                  "&:hover": { backgroundColor: "#268A5A" },
                  py: { xs: 1.2, sm: 1.5 },
                  fontSize: { xs: "0.9rem", sm: "1rem" },
                  textTransform: "none",
                  borderRadius: 2,
                  mt: 1
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : activeTab === 0 ? (
                  "Sign In"
                ) : (
                  "Create Account"
                )}
              </Button>

              <div className="flex items-center my-3 sm:my-4">
                <div className="flex-1 border-t border-gray-300"></div>
                <span className="px-3 sm:px-4 text-gray-500 text-xs sm:text-sm">or</span>
                <div className="flex-1 border-t border-gray-300"></div>
              </div>

              <Button
                fullWidth
                variant="outlined"
                onClick={handleGoogleSignIn}
                disabled={loading}
                startIcon={<FcGoogle size={20} />}
                sx={{
                  borderColor: "#E5E7EB",
                  color: "#374151",
                  py: { xs: 1.2, sm: 1.5 },
                  fontSize: { xs: "0.9rem", sm: "1rem" },
                  textTransform: "none",
                  borderRadius: 2,
                  "&:hover": {
                    borderColor: "#2FA86A",
                    backgroundColor: "rgba(47, 168, 106, 0.04)",
                  },
                }}
              >
                Continue with Google
              </Button>
            </form>
          </div>
        </div>
      </div>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default LoginRegister;
