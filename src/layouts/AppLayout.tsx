import { useState, useEffect, useRef } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Briefcase, FileText, Settings, LogOut, ArrowLeft, Banknote, UserSquare2, Menu, X, MessageSquare, Send, ChevronLeft, Layers, Lock, Loader2, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../store/authStore";
import { useDataStore } from "../store/dataStore";
import { supabase } from "../supabase";

export default function AppLayout() {
  const { role, user, employeeId, companyId, signOut, activeWorkspace, setActiveWorkspace } = useAuthStore();
  const { companies, employees, messages, fetchAllData } = useDataStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  const [activeContact, setActiveContact] = useState<any>(null);
  const [messageText, setMessageText] = useState("");
  const [toastMsg, setToastMsg] = useState<{sender: string, content: string} | null>(null);
  const [chatCompanyFilter, setChatCompanyFilter] = useState<string>("all");
  
  const prevMessageCount = useRef(messages.length);

  const masterAdmin = employees.find(e => e.access_level === 'admin');

  const activeCompany = activeWorkspace ? companies.find(c => c.id === activeWorkspace) : null;
  const currentDisplayCompany = (role !== 'admin' || activeWorkspace) ? companies.find(c => c.id === (activeWorkspace || companyId)) : null;
  const brandName = currentDisplayCompany?.name || "Zac Holdings";
  
  // Raw logo handling
  const brandLogo = currentDisplayCompany?.logo_url || masterAdmin?.profile_image_url || null;
  
  // --- DYNAMIC WORKSPACE TYPE CHECK ---
  const isAcademy = currentDisplayCompany?.business_type === 'academy' || currentDisplayCompany?.business_type?.includes('education');

  const handleExitWorkspace = async () => { 
    setActiveWorkspace(null); 
    await fetchAllData(); 
    setIsMobileDrawerOpen(false);
    navigate("/dashboard"); 
  };
  
  const handleSignOut = async () => { 
    await signOut(); 
    navigate("/login"); 
  };

  // Close mobile drawer when route changes
  useEffect(() => {
    setIsMobileDrawerOpen(false);
  }, [location.pathname]);

  // --- DYNAMIC NAVIGATION LABELS (DESKTOP) ---
  const allNavLinks = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard", allowedRoles: ['admin', 'head', 'user'] },
    { path: "/projects", icon: Briefcase, label: isAcademy ? "Courses" : "Projects", allowedRoles: ['admin', 'head', 'user'] },
    { path: "/customers", icon: UserSquare2, label: isAcademy ? "Students" : "Customers", allowedRoles: ['admin', 'head'] },
    { path: "/finance", icon: Banknote, label: "Finance", allowedRoles: ['admin', 'head'] },
    { path: "/invoices", icon: FileText, label: "Invoices", allowedRoles: ['admin', 'head'] },
    { path: "/employees", icon: Users, label: "Personnel", allowedRoles: ['admin', 'head'] },
    { path: "/settings", icon: Settings, label: "Settings", allowedRoles: ['admin', 'head', 'user'] },
  ];
  
  const visibleLinks = allNavLinks.filter(link => link.allowedRoles.includes(role || 'user'));

  const allowedContacts = employees.filter(emp => {
    if (emp.id == employeeId) return false; 
    const currentRole = role?.toLowerCase() || 'user';
    
    if (currentRole === 'admin') {
      if (activeWorkspace) return emp.company_id === activeWorkspace || emp.access_level === 'admin';
      if (chatCompanyFilter !== "all") return emp.company_id?.toString() === chatCompanyFilter || emp.access_level === 'admin';
      return true;
    }
    
    if (currentRole === 'head' || currentRole === 'user') return emp.access_level === 'admin' || emp.company_id == companyId;
    return false;
  });

  const conversation = messages.filter(m => (m.sender_id == employeeId && m.receiver_id == activeContact?.id) || (m.sender_id == activeContact?.id && m.receiver_id == employeeId));
  const totalUnread = messages.filter(m => m.receiver_id == employeeId && !m.is_read).length;

  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      const newMessages = messages.slice(prevMessageCount.current);
      const myNewMsg = newMessages.find(m => m.receiver_id == employeeId && !m.is_read);
      if (myNewMsg && myNewMsg.sender_id != activeContact?.id) {
        const sender = employees.find(e => e.id == myNewMsg.sender_id);
        setToastMsg({ sender: sender?.name || 'System', content: myNewMsg.content });
        setTimeout(() => setToastMsg(null), 5000);
      }
    }
    prevMessageCount.current = messages.length;
  }, [messages, employeeId, activeContact, employees]);

  const handleSelectContact = async (contact: any) => {
    setActiveContact(contact);
    const hasUnread = messages.some(m => m.sender_id == contact.id && m.receiver_id == employeeId && !m.is_read);
    if (hasUnread) {
      await supabase.from('messages').update({ is_read: true }).eq('sender_id', contact.id).eq('receiver_id', employeeId);
      fetchAllData();
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeContact || !employeeId) return;
    await supabase.from('messages').insert([{ sender_id: employeeId, receiver_id: activeContact.id, content: messageText }]);
    setMessageText(""); await fetchAllData(); 
  };

  const currentUser = employees.find(e => e.id == employeeId);
  const displayEmail = user?.email || 'User';
  const displayInitial = currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : displayEmail.charAt(0).toUpperCase();
  const displayName = currentUser?.name || displayEmail.split('@')[0];

  // ============================================================================
  // POLYMORPHIC ERP INTERCEPTOR LOGIC
  // ============================================================================
  const unclassifiedCompanies = companies.filter(c => c.business_type === null || c.business_type === undefined);
  const [classifications, setClassifications] = useState<Record<number, string>>({});
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    if (unclassifiedCompanies.length > 0 && Object.keys(classifications).length === 0) {
      const initial: Record<number, string> = {};
      unclassifiedCompanies.forEach(c => initial[c.id] = 'normal');
      setClassifications(initial);
    }
  }, [unclassifiedCompanies, classifications]);

  const handleSaveClassifications = async () => {
    setIsInitializing(true);
    try {
      for (const [cId, bType] of Object.entries(classifications)) {
        const { error } = await supabase.from('companies').update({ business_type: bType }).eq('id', parseInt(cId));
        if (error) throw error;
      }
      await fetchAllData();
      window.location.reload();
    } catch(e: any) {
      alert("Error saving: " + e.message);
    } finally {
      setIsInitializing(false);
    }
  };

  // ADMIN WIZARD
  if (role === 'admin' && unclassifiedCompanies.length > 0) {
    return (
      <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-2xl flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-slate-100">
          <div className="bg-gradient-to-r from-blue-900 to-indigo-800 p-8 sm:p-10 text-center relative overflow-hidden">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight relative z-10">Workspace Architecture Configuration</h2>
            <p className="text-[13px] font-medium text-blue-100 mt-3 opacity-90 max-w-lg mx-auto relative z-10 leading-relaxed">
              We have detected newly registered subsidiaries. To proceed, please assign an operational framework to each entity.
            </p>
          </div>
          <div className="p-8 sm:p-10 bg-[#FAFCFF]">
             <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
               {unclassifiedCompanies.map(c => (
                 <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-center gap-3">
                       <div className="h-10 w-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center shrink-0">
                         <Building2 className="h-5 w-5 text-slate-400" />
                       </div>
                       <div>
                         <p className="text-[14px] font-bold text-slate-900">{c.name}</p>
                       </div>
                    </div>
                    <select 
                      value={classifications[c.id] || 'normal'} 
                      onChange={(e) => setClassifications({...classifications, [c.id]: e.target.value})}
                      className="w-full sm:w-56 h-11 rounded-xl bg-slate-50 border border-slate-200 px-4 text-[12px] font-bold text-slate-700 outline-none focus:border-blue-500 shadow-sm"
                    >
                      <option value="normal">Standard Corporate</option>
                      <option value="academy">Academy & Education</option>
                      <option value="construction">Construction & Site Mgmt</option>
                      <option value="technical">Tech & Software Dev</option>
                    </select>
                 </div>
               ))}
             </div>
             <button onClick={handleSaveClassifications} disabled={isInitializing} className="w-full mt-8 h-14 bg-slate-900 text-white hover:bg-slate-800 rounded-2xl text-[14px] font-bold shadow-xl flex items-center justify-center gap-2">
               {isInitializing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Deploy Configurations & Enter Platform"}
             </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // USER LOCKOUT
  const isUserLockedOut = role !== 'admin' && currentDisplayCompany && !currentDisplayCompany.business_type;
  if (isUserLockedOut) {
    return (
      <div className="fixed inset-0 z-[10000] bg-slate-900 flex items-center justify-center p-4">
         <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center relative z-10 max-w-md">
            <h1 className="text-3xl font-black text-white tracking-tight mb-4">System Updating</h1>
            <p className="text-sm font-medium text-slate-400 leading-relaxed mb-8">
              Your workspace architecture is currently being configured. Please check back shortly.
            </p>
            <button onClick={handleSignOut} className="px-8 py-3 rounded-full bg-white/10 text-white font-bold text-xs uppercase hover:bg-white/20">Sign Out</button>
         </motion.div>
      </div>
    );
  }
  // ============================================================================


  return (
    <div className="flex h-[100dvh] w-full bg-[#F8F9FC] text-slate-800 overflow-hidden font-sans sm:p-4 lg:p-6 selection:bg-blue-900 selection:text-white relative print:p-0 print:bg-white print:block print:h-auto">
      
      {/* --- DESKTOP SIDEBAR --- */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }} 
            className="hidden sm:flex bg-white flex-col shrink-0 z-20 border-r border-slate-100/50 sm:rounded-l-[2.5rem] print:hidden shadow-[0_8px_40px_rgb(0,0,0,0.04)]"
          >
            <div className="h-28 flex items-center justify-between px-8 shrink-0">
              <div className="flex items-center">
                {brandLogo ? (
                  <img src={brandLogo} alt="Logo" className="h-10 w-auto max-w-[120px] object-contain mr-3" />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-900 via-blue-900 to-blue-800 flex items-center justify-center text-white text-[16px] font-black tracking-tighter mr-3 shadow-md z-10">
                    {brandName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-[13px] font-bold text-slate-800 tracking-wide mt-0.5 truncate">{brandName}</div>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="h-9 w-9 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm transition-all"><X className="h-4 w-4" /></button>
            </div>

            <nav className="flex-1 overflow-y-auto px-6 space-y-2 [&::-webkit-scrollbar]:hidden pt-2">
              {visibleLinks.map((link) => (
                <NavLink key={link.path} to={link.path} className={({ isActive }) => `group flex items-center gap-4 px-5 py-4 text-[14px] rounded-2xl transition-all duration-300 ${isActive ? 'bg-gradient-to-r from-blue-900 to-indigo-800 text-white shadow-md font-semibold' : 'text-slate-500 hover:bg-slate-50 hover:text-blue-900'}`}>
                  {({ isActive }) => (
                    <>
                      <link.icon className={`h-5 w-5 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-900'}`} />
                      {link.label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="px-6 pb-6 flex flex-col shrink-0">
              <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-3 border border-slate-100 mb-4 shadow-sm hover:border-slate-200 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    {currentUser?.profile_image_url ? (
                      <img src={currentUser.profile_image_url} alt="" className="h-full w-full object-cover"/>
                    ) : (
                      <span className="text-[12px] font-bold text-slate-400">{displayInitial}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-[13px] font-bold text-slate-900 truncate leading-tight">{displayName}</p>
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5 leading-none">{role || 'Operator'}</p>
                  </div>
                </div>
                <button onClick={handleSignOut} className="h-8 w-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-600 shadow-sm shrink-0"><LogOut className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col min-w-0 relative bg-[#FAFCFF] sm:rounded-r-[2.5rem] sm:border-y sm:border-r border-slate-100 sm:shadow-[0_8px_40px_rgb(0,0,0,0.04)] print:bg-white print:block overflow-hidden">
        
        {/* --- DESKTOP HEADER --- */}
        <header className="absolute top-6 left-0 right-0 hidden sm:flex items-start justify-between px-6 lg:px-10 z-20 pointer-events-none print:hidden">
          <div className="pointer-events-auto">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="h-12 w-12 bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-full flex items-center justify-center text-slate-500 hover:text-blue-900 shadow-sm transition-all"><Menu className="h-5 w-5" /></button>
            )}
          </div>
          <div className="pointer-events-auto flex items-center gap-3">
             <button onClick={() => setIsChatOpen(true)} className="relative h-12 w-12 bg-white/90 backdrop-blur-md border border-slate-200/50 rounded-full flex items-center justify-center text-slate-500 hover:text-blue-900 shadow-sm transition-all">
                <MessageSquare className="h-5 w-5" />
                {totalUnread > 0 && <span className="absolute top-0 right-0 h-3.5 w-3.5 border-2 border-white bg-rose-500 rounded-full"></span>}
             </button>
            {activeWorkspace && role === 'admin' && (
              <div className="flex items-center gap-3 bg-white/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-200/50 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Viewing:</span>
                <span className="text-[12px] font-bold text-blue-900">{activeCompany?.name}</span>
                <span className="h-5 w-[1px] bg-slate-200 mx-2"></span>
                <button onClick={handleExitWorkspace} className="text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-wider flex items-center gap-1.5"><ArrowLeft className="h-3.5 w-3.5"/> Exit</button>
              </div>
            )}
          </div>
        </header>

        {/* --- MOBILE APP BAR (Notch Style with Solid Background to block scrolling) --- */}
        <div className="sm:hidden fixed top-0 left-0 right-0 h-[72px] bg-[#FAFCFF] z-40 print:hidden flex items-center justify-between px-4 border-b border-slate-100/50 shadow-sm">
           
           {/* Left Menu Button */}
           <div className="flex gap-2 items-center">
             {activeWorkspace && role === 'admin' && (
               <button onClick={handleExitWorkspace} className="h-10 w-10 text-rose-500 flex items-center justify-center transition-all active:scale-95"><ArrowLeft className="h-5 w-5" /></button>
             )}
             <button onClick={() => setIsMobileDrawerOpen(true)} className="h-10 w-10 text-slate-500 hover:text-blue-900 flex items-center justify-center transition-all active:scale-95">
                <Menu className="h-6 w-6" />
             </button>
           </div>

           {/* Center "Notch" Logo Pill */}
           <div className="bg-white border border-slate-200/60 rounded-[1.5rem] px-4 py-2 shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95">
              {brandLogo ? (
                 <img src={brandLogo} alt="Logo" className="h-5 w-auto max-w-[80px] object-contain shrink-0" />
              ) : (
                 <div className="h-5 w-5 rounded-md bg-slate-900 flex items-center justify-center text-white text-[9px] font-black shrink-0">
                   {brandName.charAt(0).toUpperCase()}
                 </div>
              )}
              <div className="font-bold text-slate-900 text-[13px] tracking-tight flex overflow-visible">
                {brandName.split("").map((char, index) => (
                  <motion.span
                    key={index}
                    animate={{ x: [0, 3, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 3.5, delay: index * 0.05, ease: "easeInOut" }}
                    style={{ display: "inline-block", whiteSpace: "pre" }}
                  >
                    {char}
                  </motion.span>
                ))}
              </div>
           </div>

           {/* Right Chat Button */}
           <div className="flex items-center">
             <button onClick={() => setIsChatOpen(true)} className="relative h-10 w-10 text-slate-500 hover:text-blue-900 flex items-center justify-center transition-all active:scale-95">
                <MessageSquare className="h-5 w-5" />
                {totalUnread > 0 && <span className="absolute top-2 right-2 h-2.5 w-2.5 border-2 border-white bg-rose-500 rounded-full"></span>}
             </button>
           </div>
        </div>

        {/* --- MOBILE SIDE DRAWER (HAMBURGER MENU) --- */}
        <AnimatePresence>
           {isMobileDrawerOpen && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileDrawerOpen(false)} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] sm:hidden print:hidden" />
                <motion.div 
                  initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="fixed top-0 left-0 bottom-0 w-[80%] max-w-[320px] bg-white z-[90] shadow-2xl flex flex-col sm:hidden print:hidden rounded-r-[2rem] overflow-hidden"
                >
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col relative shrink-0">
                     <button onClick={() => setIsMobileDrawerOpen(false)} className="absolute top-4 right-4 p-2 text-slate-400"><X className="h-5 w-5" /></button>
                     <div className="h-16 w-16 rounded-full bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm mb-4 mt-2">
                       {currentUser?.profile_image_url ? (
                         <img src={currentUser.profile_image_url} alt="" className="h-full w-full object-cover"/>
                       ) : (
                         <span className="text-xl font-bold text-slate-400">{displayInitial}</span>
                       )}
                     </div>
                     <p className="text-lg font-black text-slate-900 leading-tight">{displayName}</p>
                     <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mt-1">{role || 'Operator'}</p>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">Navigation</p>
                    {visibleLinks.map((link) => (
                      <NavLink key={link.path} to={link.path} onClick={() => setIsMobileDrawerOpen(false)} className={({ isActive }) => `flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all text-[15px] font-bold ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                        {({ isActive }) => (
                          <>
                            <link.icon className={`h-5 w-5 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                            {link.label}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-[#FAFCFF] shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                     <button onClick={handleSignOut} className="w-full py-3.5 rounded-xl bg-white border border-slate-200 text-[14px] font-bold text-rose-600 flex items-center justify-center gap-2 shadow-sm">
                        <LogOut className="h-4 w-4" /> Sign Out
                     </button>
                  </div>
                </motion.div>
              </>
           )}
        </AnimatePresence>

        <main className={`flex-1 overflow-y-auto transition-all duration-300 relative z-10 print:p-0 print:pt-0 print:overflow-visible
           max-sm:px-4 max-sm:pt-[88px] max-sm:pb-8
           sm:pt-10 sm:pb-10
           ${!isSidebarOpen ? 'sm:pl-20 lg:pl-28' : 'sm:pl-6 lg:pl-10'} 
           ${activeWorkspace && role === 'admin' ? 'sm:pr-6 lg:pr-64' : 'sm:pr-6 lg:pr-10'}
           [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full`}>
          <Outlet />
        </main>
      </div>

      {/* --- CHAT DRAWER --- */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} className="fixed inset-0 sm:absolute sm:inset-auto bg-slate-900/40 sm:bg-slate-900/10 backdrop-blur-sm z-[75] sm:z-40 sm:rounded-[2.5rem] print:hidden" />
            <motion.div 
              initial={{ x: typeof window !== "undefined" && window.innerWidth >= 640 ? "100%" : 0, y: typeof window !== "undefined" && window.innerWidth < 640 ? "100%" : 0 }} 
              animate={{ x: 0, y: 0 }} 
              exit={{ x: typeof window !== "undefined" && window.innerWidth >= 640 ? "100%" : 0, y: typeof window !== "undefined" && window.innerWidth < 640 ? "100%" : 0 }} 
              transition={{ type: "spring", damping: 30, stiffness: 300 }} 
              className="fixed inset-0 sm:absolute sm:inset-auto sm:top-0 sm:right-0 sm:h-full sm:w-[400px] bg-white shadow-2xl z-[100] sm:z-50 flex flex-col sm:border-l border-slate-100 print:hidden"
            >
              
              <div className="h-16 sm:h-24 border-b border-slate-100 flex items-center justify-between px-6 shrink-0 bg-white">
                {activeContact ? (
                  <div className="flex items-center gap-3">
                    <button onClick={() => setActiveContact(null)} className="h-10 w-10 bg-slate-50 flex items-center justify-center rounded-full text-slate-500 hover:text-blue-900 hover:bg-blue-50 transition-colors"><ChevronLeft className="h-5 w-5" /></button>
                    <div><h3 className="font-bold text-[15px] text-slate-900 leading-none">{activeContact.name}</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">{activeContact.access_level}</p></div>
                  </div>
                ) : (
                  <div><h3 className="font-bold text-[18px] text-slate-900">Messages</h3><p className="text-[11px] text-slate-400 mt-1 font-medium">Internal Communications</p></div>
                )}
                <button onClick={() => setIsChatOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-50 transition-colors"><X className="h-5 w-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-[#FAFCFF]">
                {!activeContact ? (
                  <div className="space-y-4">
                    
                    {role === 'admin' && !activeWorkspace && (
                      <div>
                        <select
                          value={chatCompanyFilter}
                          onChange={(e) => setChatCompanyFilter(e.target.value)}
                          className="w-full h-11 rounded-xl bg-white border border-slate-200 px-4 text-sm font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition-colors shadow-sm focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="all">Global Directory</option>
                          {companies.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
                        </select>
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Contacts</p>
                      <div className="space-y-2">
                        {allowedContacts.length === 0 && (
                          <p className="text-xs text-slate-400 italic px-2">No team members available.</p>
                        )}
                        {allowedContacts.map(contact => {
                          const contactUnread = messages.filter(m => m.sender_id == contact.id && m.receiver_id == employeeId && !m.is_read).length;
                          return (
                            <button key={contact.id} onClick={() => handleSelectContact(contact)} className="w-full flex items-center gap-4 p-3 rounded-2xl bg-white border border-slate-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all text-left group">
                              <div className="h-12 w-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-[13px] font-bold text-slate-600 overflow-hidden shrink-0">
                                {contact.profile_image_url ? <img src={contact.profile_image_url} alt="" className="h-full w-full object-cover" /> : (contact.name ? contact.name.charAt(0).toUpperCase() : 'U')}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={`text-[14px] truncate ${contactUnread > 0 ? 'font-bold text-blue-900' : 'font-semibold text-slate-700 group-hover:text-blue-900 transition-colors'}`}>{contact.name}</p>
                              </div>
                              {contactUnread > 0 && <div className="h-2.5 w-2.5 bg-rose-500 rounded-full shrink-0 shadow-sm"></div>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 flex flex-col justify-end min-h-full pb-4">
                    {conversation.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center flex-col text-slate-400 mb-8">
                        <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-4"><MessageSquare className="h-6 w-6 text-slate-300" /></div>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Encrypted Channel Open</p>
                      </div>
                    ) : (
                      conversation.map((msg, i) => {
                        const isMe = msg.sender_id == employeeId;
                        return (
                          <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] px-5 py-3.5 text-[14px] font-medium leading-relaxed shadow-sm ${isMe ? 'bg-gradient-to-br from-blue-900 to-indigo-800 text-white rounded-2xl rounded-tr-sm' : 'bg-white border border-slate-100 text-slate-700 rounded-2xl rounded-tl-sm'}`}>
                              {msg.content}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {activeContact && (
                <div className="p-5 bg-white border-t border-slate-100 shrink-0 mb-[env(safe-area-inset-bottom)]">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-blue-900/20 focus-within:border-blue-900 transition-all shadow-sm">
                    <input type="text" placeholder="Type your message..." value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} className="flex-1 bg-transparent border-none text-[14px] outline-none placeholder:text-slate-400 px-4 py-2.5 font-medium" />
                    <button onClick={handleSendMessage} className="h-12 w-12 bg-gradient-to-r from-blue-900 to-indigo-800 rounded-xl flex items-center justify-center text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 shrink-0 transition-all"><Send className="h-5 w-5 ml-0.5" /></button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMsg && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} onClick={() => { setIsChatOpen(true); setToastMsg(null); }} className="fixed top-20 sm:top-auto sm:bottom-28 lg:bottom-32 left-4 right-4 sm:left-auto sm:right-6 lg:right-10 z-[110] bg-gradient-to-r from-blue-900 to-indigo-800 text-white p-5 rounded-2xl shadow-2xl flex items-start gap-4 sm:min-w-[300px] cursor-pointer border border-blue-700/50 print:hidden">
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-[9px] font-bold text-blue-200 uppercase tracking-widest mb-1.5">New Message</p>
              <p className="text-[14px] font-bold truncate">{toastMsg.sender}</p>
              <p className="text-[13px] text-blue-100 truncate mt-1">{toastMsg.content}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setToastMsg(null); }} className="text-blue-300 hover:text-white transition-colors bg-blue-800/50 p-1.5 rounded-lg"><X className="h-4 w-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}