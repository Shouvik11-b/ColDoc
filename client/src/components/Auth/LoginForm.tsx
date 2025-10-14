import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import OAuthButtons from './OAuthButtons';

const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, login } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/documents');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    // Handle OAuth callback
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      toast.error('Authentication failed');
    } else if (token) {
      // In a real app, you'd also get user data
      // For now, we'll just store the token and redirect
      localStorage.setItem('token', token);
      toast.success('Login successful!');
      navigate('/documents');
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Welcome to CollabEditor
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to start collaborating on documents
          </p>
        </div>
        
        <div className="mt-8 space-y-4">
          <OAuthButtons />
        </div>
        
        <div className="text-center">
          <div className="text-sm text-gray-500">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
