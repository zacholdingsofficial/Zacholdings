import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] w-full bg-[#f8fafc] flex flex-col items-center justify-center overflow-hidden font-sans relative">
      
      {/* Soft, organic background blur (matches Login Page) */}
      <motion.div 
        animate={{ 
          scale: [1, 1.05, 1],
          opacity: [0.5, 0.6, 0.5]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[-10%] left-[-10%] h-[40rem] w-[40rem] rounded-full bg-slate-200/50 blur-[120px] mix-blend-multiply pointer-events-none" 
      />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl mx-auto"
      >
        {/* Simple, premium logo placeholder */}
        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
          <span className="text-3xl font-bold">Z</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-slate-900 mb-6">
          Zac Holdings
        </h1>
        
        <p className="text-lg sm:text-xl text-slate-500 tracking-wide mb-10 max-w-2xl font-light">
          The centralized enterprise operating system for our subsidiaries and global workforce.
        </p>

        <button 
          onClick={() => navigate('/login')}
          className="group flex h-14 items-center justify-center rounded-full bg-slate-900 px-8 text-base font-medium text-white transition-all hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5"
        >
          Sign In to Workspace
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </motion.div>

      {/* Subtle footer */}
      <div className="absolute bottom-8 text-center w-full text-xs text-slate-400 font-medium">
        © {new Date().getFullYear()} Zac Holdings. Internal Use Only.
      </div>
    </div>
  );
}