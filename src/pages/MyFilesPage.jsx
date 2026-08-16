import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import MyFiles from '@/components/MyFiles';

export default function MyFilesPage() {
  const navigate = useNavigate();
  return (
    <div className="safe-top px-6 sm:px-8 pb-4 min-h-screen">
      <header className="mb-4 flex items-center gap-2">
        <button onClick={() => navigate('/settings')} className="touch-44 w-9 h-9 rounded-full bg-muted flex items-center justify-center">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-extrabold lowercase tracking-tight">my files</h1>
      </header>
      <MyFiles />
    </div>
  );
}