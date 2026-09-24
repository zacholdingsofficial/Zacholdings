import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Building2, Plus, ArrowRight, X, Globe, Trash2, Edit3, LogIn, Clock, CheckCircle2, Megaphone, Bell, Loader2, ImagePlus, Activity, Briefcase, Wallet, FileText, Layers } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useDataStore } from "../../store/dataStore";
import { supabase } from "../../supabase";

// --- NATIVE IMAGE COMPRESSION ENGINE ---
const compressImage = async (file: File, maxWidth = 400, quality = 0.8): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        }
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg', lastModified: Date.now() }));
          } else {
            reject(new Error('Compression failed'));
          }
        }, 'image/jpeg', quality);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { role, activeWorkspace, setActiveWorkspace, employeeId, companyId, user } = useAuthStore();
  const { companies, employees, projects, invoices, salaryPayments, announcements, tasks = [], fetchAllData } = useDataStore();

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [companyModalMode, setCompanyModalMode] = useState<"view" | "edit" | "add">("view");
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ title: "", content: "", company_id: "all" });
  const [activeAnnouncementIndex, setActiveAnnouncementIndex] = useState(0);

  // --- DYNAMIC WORKSPACE TYPES STATE ---
  const [businessTypes, setBusinessTypes] = useState<{slug: string, label: string}[]>([]);
  const [showCustomTypeInput, setShowCustomTypeInput] = useState(false);
  const [customTypeLabel, setCustomTypeLabel] = useState("");

  // --- PULSE ACTIVITY STATE ---
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityFilterCompanyId, setActivityFilterCompanyId] = useState<string>("all");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [showLogoMenu, setShowLogoMenu] = useState(false);
  
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "compressing" | "uploading" | "saving">("idle");
  const [companyFormData, setCompanyFormData] = useState({ name: "", area: "", head_name: "", phone: "", website_url: "", logo_url: "", business_type: "normal", allow_head_finance: true });

  const activeCompanyId = activeWorkspace || companyId;
  const visibleAnnouncements = announcements.filter(a => !a.company_id || a.company_id === activeCompanyId);
  const safeAnnouncementIndex = activeAnnouncementIndex % (visibleAnnouncements.length || 1);

  const currentEmployee = employees.find(e => e.id === employeeId);
  const firstName = currentEmployee?.name 
    ? currentEmployee.name.split(' ')[0] 
    : (user?.email ? user.email.split('@')[0].toUpperCase() : 'USER');

  // Fetch Business Types on Mount
  useEffect(() => {
    const fetchTypes = async () => {
      const { data } = await supabase.from('business_types').select('*');
      if (data) setBusinessTypes(data);
    };
    fetchTypes();
  }, []);

  useEffect(() => {
    if (visibleAnnouncements && visibleAnnouncements.length > 1) {
      const timer = setInterval(() => {
        setActiveAnnouncementIndex((prev) => (prev + 1) % visibleAnnouncements.length);
      }, 6000);
      return () => clearInterval(timer);
    }
  }, [announcements, activeCompanyId]);

  const openAddCompany = () => { 
    setCompanyModalMode("add"); setSelectedCompany(null); 
    setLogoFile(null); setLogoPreview(null); setRemoveLogo(false); setShowLogoMenu(false);
    setShowCustomTypeInput(false); setCustomTypeLabel("");
    setCompanyFormData({ name: "", area: "", head_name: "", phone: "", website_url: "", logo_url: "", business_type: "normal", allow_head_finance: true }); 
    setIsCompanyModalOpen(true); 
  };
  
  const openViewCompany = (company: any) => { 
    setCompanyModalMode("view"); setSelectedCompany(company); 
    setIsCompanyModalOpen(true); 
  };
  
  const openEditCompany = () => { 
    setCompanyModalMode("edit"); 
    setLogoFile(null); setLogoPreview(null); setRemoveLogo(false); setShowLogoMenu(false);
    setShowCustomTypeInput(false); setCustomTypeLabel("");
    setCompanyFormData({ 
      name: selectedCompany.name || "", 
      area: selectedCompany.area || "", 
      head_name: selectedCompany.head_name || "", 
      phone: selectedCompany.phone || "", 
      website_url: selectedCompany.website_url || "", 
      logo_url: selectedCompany.logo_url || "",
      business_type: selectedCompany.business_type || "normal",
      allow_head_finance: selectedCompany.allow_head_finance ?? true
    }); 
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => { 
    if (e.target.files && e.target.files[0]) { 
      setLogoFile(e.target.files[0]); 
      setLogoPreview(URL.createObjectURL(e.target.files[0])); 
      setRemoveLogo(false);
      setShowLogoMenu(false);
    } 
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setRemoveLogo(true);
    setShowLogoMenu(false);
  };

  const deleteOldLogo = async (url: string | null) => {
    if (!url) return;
    try {
      const urlParts = url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      if (fileName) await supabase.storage.from('logos').remove([fileName]);
    } catch (e) {
      console.warn("Could not delete old logo.");
    }
  };

  const handleSaveCompany = async () => {
    if (!companyFormData.name) return alert("Company Name is required.");
    setSaveStatus("saving");
    let finalLogoUrl = selectedCompany?.logo_url || null;
    let finalBusinessType = companyFormData.business_type;
    
    try {
      // 1. Process New Custom Type if requested
      if (showCustomTypeInput && customTypeLabel.trim()) {
         const newSlug = customTypeLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
         const { error: typeError } = await supabase.from('business_types').insert([{ slug: newSlug, label: customTypeLabel.trim() }]);
         if (typeError && typeError.code !== '23505') throw new Error(`Type Creation Error: ${typeError.message}`); // Ignore unique constraint errors
         finalBusinessType = newSlug;
         setBusinessTypes(prev => [...prev, { slug: newSlug, label: customTypeLabel.trim() }]);
      }

      // 2. Process Logo
      if (logoFile || removeLogo) {
        if (selectedCompany?.logo_url) await deleteOldLogo(selectedCompany.logo_url);
      }

      if (logoFile) {
        setSaveStatus("compressing");
        const compressedFile = await compressImage(logoFile, 400, 0.8);
        setSaveStatus("uploading");
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.jpg`;
        const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, compressedFile);
        
        if (!uploadError) { 
          const { data } = supabase.storage.from('logos').getPublicUrl(fileName); 
          finalLogoUrl = data.publicUrl; 
        } else { 
          alert(`Logo Upload Error: ${uploadError.message}`); 
          setSaveStatus("idle"); return; 
        }
      } else if (removeLogo) {
        finalLogoUrl = null;
      }
      
      // 3. Save Company with Parent Architecture Logic
      setSaveStatus("saving");
      const payload = { 
        name: companyFormData.name, 
        area: finalBusinessType === 'parent' ? 'Holding Company' : companyFormData.area, 
        head_name: finalBusinessType === 'parent' ? 'System Admin' : companyFormData.head_name, 
        phone: finalBusinessType === 'parent' ? null : companyFormData.phone, 
        website_url: finalBusinessType === 'parent' ? null : companyFormData.website_url, 
        logo_url: finalLogoUrl,
        business_type: finalBusinessType,
        allow_head_finance: finalBusinessType === 'parent' ? true : companyFormData.allow_head_finance
      };
      
      if (companyModalMode === 'add') { 
        const { error } = await supabase.from('companies').insert([payload]); 
        if (error) throw error; 
      } else { 
        const { error } = await supabase.from('companies').update(payload).eq('id', selectedCompany.id); 
        if (error) throw error; 
      }
      
      await fetchAllData(); 
      setIsCompanyModalOpen(false);
    } catch (error: any) { 
      alert(`Database Error: ${error.message}`); 
    } finally { 
      setSaveStatus("idle"); 
    }
  };

  const handleDeleteCompany = async () => { 
    if (!window.confirm(`Delete ${selectedCompany.name}?`)) return; 
    setSaveStatus("saving"); 
    try {
      if (selectedCompany.logo_url) await deleteOldLogo(selectedCompany.logo_url);
      await supabase.from('companies').delete().eq('id', selectedCompany.id); 
      await fetchAllData(); 
      setIsCompanyModalOpen(false); 
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSaveStatus("idle"); 
    }
  };

  const handlePostAnnouncement = async () => {
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) return alert("Both title and content are required.");
    setIsSavingAnnouncement(true);
    const payload = {
      title: announcementForm.title,
      content: announcementForm.content,
      company_id: announcementForm.company_id === "all" ? null : parseInt(announcementForm.company_id)
    };
    await supabase.from('announcements').insert([payload]);
    await fetchAllData();
    setAnnouncementForm({ title: "", content: "", company_id: "all" });
    setIsAnnouncementModalOpen(false);
    setIsSavingAnnouncement(false);
  };

  const handleDeleteAnnouncement = async (id: number) => {
    if(!window.confirm("Delete this announcement?")) return;
    await supabase.from('announcements').delete().eq('id', id);
    await fetchAllData();
  };

  const handleEnterWorkspace = async () => { setActiveWorkspace(selectedCompany.id); await fetchAllData(); setIsCompanyModalOpen(false); };

  const isImpersonating = role === 'admin' && activeWorkspace !== null;
  
  const myProjects = projects.filter(p => (p.assignee_ids || []).includes(employeeId));
  const globalPayroll = salaryPayments.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);
  
  const activeWorkspaceEmployees = employees.filter(e => e.company_id === activeCompanyId).map(e => e.id);
  const selectedCompanyEmployeeIds = selectedCompany ? employees.filter(e => e.company_id === selectedCompany.id).map(e => e.id) : [];
  const selectedCompanyPayroll = salaryPayments
    .filter(p => selectedCompanyEmployeeIds.includes(p.employee_id))
    .reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);

  const mySalaries = salaryPayments.filter(s => s.employee_id === employeeId).sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
  const lastSalary = mySalaries[0];

  const displayLogo = logoPreview || (!removeLogo && selectedCompany?.logo_url ? selectedCompany.logo_url : null);

  // --- PULSE FEED GENERATOR ---
  const getActivityFeed = () => {
    let feed: any[] = [];
    const todayStr = new Date().toISOString();

    const isCompanyMatch = (itemCompanyId: any) => {
      if (role === 'admin' && !isImpersonating) {
        return activityFilterCompanyId === 'all' || itemCompanyId?.toString() === activityFilterCompanyId;
      }
      return itemCompanyId === activeCompanyId;
    };

    projects.forEach(p => {
      if (role === 'user' && !(p.assignee_ids || []).includes(employeeId)) return;
      if (role !== 'user' && !isCompanyMatch(p.company_id)) return;
      const compName = companies.find(c => c.id === p.company_id)?.name || 'Subsidiary';
      feed.push({ id: `proj_${p.id}`, type: 'Project', title: `Project Initiated: ${p.name}`, desc: p.description || 'A new workflow was created.', date: p.created_at || todayStr, companyName: compName, icon: Briefcase, color: 'text-blue-500 bg-blue-50 border-blue-200' });
    });

    salaryPayments.forEach(p => {
      if (role === 'user' && p.employee_id !== employeeId) return;
      const compId = p.company_id || employees.find(e => e.id === p.employee_id)?.company_id;
      if (role !== 'user' && !isCompanyMatch(compId)) return;
      const emp = employees.find(e => e.id === p.employee_id);
      const compName = companies.find(c => c.id === compId)?.name || 'Subsidiary';
      feed.push({ id: `pay_${p.id}`, type: 'Payment', title: `Payout Disbursed: ₹${parseFloat(p.amount || 0).toLocaleString()}`, desc: role === 'user' ? `Your ${p.payment_type || 'payout'} payment was processed.` : `Transferred to ${emp?.name || 'Employee'} (${p.payment_type || 'Standard'})`, date: p.created_at || p.payment_date || todayStr, companyName: compName, icon: Wallet, color: 'text-emerald-500 bg-emerald-50 border-emerald-200' });
    });

    announcements.forEach(a => {
      if (role === 'user' && a.company_id && a.company_id !== companyId) return;
      if (role === 'head' && a.company_id && a.company_id !== activeCompanyId) return;
      if (role === 'admin' && !isImpersonating && activityFilterCompanyId !== 'all' && a.company_id && a.company_id?.toString() !== activityFilterCompanyId) return;
      const compName = a.company_id ? (companies.find(c => c.id === a.company_id)?.name || 'Subsidiary') : 'Global';
      feed.push({ id: `ann_${a.id}`, type: 'Announcement', title: `Broadcast: ${a.title}`, desc: a.content, date: a.created_at || todayStr, companyName: compName, icon: Megaphone, color: 'text-indigo-500 bg-indigo-50 border-indigo-200' });
    });

    if (role !== 'user') {
      (invoices || []).forEach(inv => {
        if (!isCompanyMatch(inv.company_id)) return;
        const compName = companies.find(c => c.id === inv.company_id)?.name || 'Subsidiary';
        feed.push({ id: `inv_${inv.id}`, type: 'Invoice', title: `Invoice Generated: ${inv.invoice_number}`, desc: `Total: ₹${parseFloat(inv.total_amount || 0).toLocaleString()} • Status: ${inv.status}`, date: inv.created_at || inv.issue_date || todayStr, companyName: compName, icon: FileText, color: 'text-amber-500 bg-amber-50 border-amber-200' });
      });
    }

    return feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50);
  };

  const pulseFeed = getActivityFeed();

  // --- RENDER ADMIN ---
  if (role === 'admin' && !isImpersonating) {
    return (
      <>
        <div className="max-w-[1200px] mx-auto space-y-8 sm:space-y-10 animate-in fade-in duration-700 relative z-0">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
            <div>
              <p className="text-[9px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-2 bg-blue-50 inline-block px-3 py-1 rounded-full">Admin Dashboard</p>
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-1 sm:mt-2">Company Overview.</h1>
            </div>
            <div className="flex gap-2 sm:gap-3 flex-wrap">
              <button onClick={() => setIsActivityModalOpen(true)} title="Activity Pulse" className="h-[42px] w-[42px] sm:h-[50px] sm:w-[50px] bg-white border border-slate-200 text-slate-600 shadow-sm hover:shadow-md hover:-translate-y-0.5 rounded-xl sm:rounded-2xl transition-all flex items-center justify-center shrink-0">
                <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600"/>
              </button>
              <button onClick={() => setIsAnnouncementModalOpen(true)} className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 px-3 py-2.5 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl text-[11px] sm:text-[13px] font-bold transition-all flex items-center justify-center">
                <Megaphone className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 text-blue-600"/> <span className="hidden sm:inline">New</span> Announcement
              </button>
              <button onClick={openAddCompany} className="flex-1 sm:flex-none bg-gradient-to-r from-blue-900 to-indigo-800 text-white shadow-lg shadow-blue-900/20 hover:shadow-xl hover:-translate-y-0.5 px-3 py-2.5 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl text-[11px] sm:text-[13px] font-bold transition-all flex items-center justify-center">
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2"/> Add Company
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="bg-white border border-slate-100 p-4 sm:p-7 rounded-2xl sm:rounded-3xl shadow-sm flex flex-col justify-between min-h-[120px] sm:min-h-[160px] relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-16 h-16 sm:w-24 sm:h-24 bg-blue-50 rounded-full blur-2xl group-hover:bg-blue-100 transition-colors"></div>
              <p className="text-[9px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest relative z-10 truncate">Companies</p>
              <p className="text-3xl sm:text-5xl font-semibold text-slate-800 tracking-tight relative z-10 mt-2">{companies.length || 0}</p>
            </div>
            <div className="bg-white border border-slate-100 p-4 sm:p-7 rounded-2xl sm:rounded-3xl shadow-sm flex flex-col justify-between min-h-[120px] sm:min-h-[160px] relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-16 h-16 sm:w-24 sm:h-24 bg-blue-50 rounded-full blur-2xl group-hover:bg-blue-100 transition-colors"></div>
              <p className="text-[9px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest relative z-10 truncate">Total Employees</p>
              <p className="text-3xl sm:text-5xl font-semibold text-slate-800 tracking-tight relative z-10 mt-2">{employees.length || 0}</p>
            </div>
            <div className="bg-white border border-slate-100 p-4 sm:p-7 rounded-2xl sm:rounded-3xl shadow-sm flex flex-col justify-between min-h-[120px] sm:min-h-[160px] relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-16 h-16 sm:w-24 sm:h-24 bg-indigo-50 rounded-full blur-2xl group-hover:bg-indigo-100 transition-colors"></div>
              <p className="text-[9px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest relative z-10 truncate">Active Projects</p>
              <p className="text-3xl sm:text-5xl font-semibold text-slate-800 tracking-tight relative z-10 mt-2">{projects.length || 0}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-800 p-4 sm:p-7 rounded-2xl sm:rounded-3xl shadow-xl shadow-blue-900/10 flex flex-col justify-between min-h-[120px] sm:min-h-[160px] relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 w-24 h-24 sm:w-40 sm:h-40 bg-white/5 rounded-full blur-3xl"></div>
              <p className="text-[9px] sm:text-[11px] font-bold text-blue-200 uppercase tracking-widest relative z-10 truncate">Total Payroll</p>
              <p className="text-2xl sm:text-4xl font-semibold text-white tracking-tight relative z-10 mt-2">₹{globalPayroll.toLocaleString()}</p>
            </div>
          </div>

          <div className="pt-2 sm:pt-4">
            <h2 className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 sm:mb-6 px-1">Company Directory</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {companies.map((company, i) => (
                <motion.div key={company.id} onClick={() => openViewCompany(company)} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-white border border-slate-100 p-4 sm:p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-200 cursor-pointer transition-all group flex items-start justify-between">
                  <div>
                    <div className="h-10 w-10 sm:h-12 sm:w-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4 sm:mb-5 overflow-hidden border border-slate-100 group-hover:scale-105 transition-transform">
                      {company.logo_url ? <img src={company.logo_url} alt="" className="h-full w-full object-contain p-1.5 sm:p-2" /> : <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400"/>}
                    </div>
                    <h3 className="font-bold text-[14px] sm:text-[15px] text-slate-900 tracking-tight">{company.name}</h3>
                    <p className="text-[11px] sm:text-[12px] font-medium text-slate-400 mt-1">{company.area || "Subsidiary"}</p>
                  </div>
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all">
                    <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-900"/>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* ADMIN PULSE MODAL */}
        <AnimatePresence>
          {isActivityModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsActivityModalOpen(false)}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center max-sm:px-4 max-sm:pt-20 max-sm:pb-[110px] sm:p-4 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} 
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-2xl h-full sm:h-[700px] sm:max-h-[85svh] flex flex-col overflow-hidden border border-slate-100 mt-auto sm:mt-0"
              >
                <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 bg-[#FAFCFF] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Activity className="h-4 w-4 sm:h-5 sm:w-5" /></div>
                    <div>
                      <h3 className="text-[13px] sm:text-[15px] font-bold text-slate-900">Activity Pulse</h3>
                      <p className="text-[9px] sm:text-[11px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">Real-time audit trail</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setIsActivityModalOpen(false)} className="h-8 w-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="p-4 sm:p-6 pb-2 border-b border-slate-100 bg-white">
                  <select 
                    value={activityFilterCompanyId} 
                    onChange={e => setActivityFilterCompanyId(e.target.value)} 
                    className="w-full h-10 sm:h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 sm:px-4 text-[12px] sm:text-[13px] font-bold outline-none cursor-pointer focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                  >
                    <option value="all">Global Activity (All Companies)</option>
                    {companies.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
                  </select>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 max-sm:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 sm:space-y-8 pb-4">
                    {pulseFeed.length === 0 ? (
                      <p className="text-[12px] sm:text-[13px] text-slate-400 italic pl-6">No recent activity detected.</p>
                    ) : pulseFeed.map(item => (
                      <div key={item.id} className="relative pl-8 group">
                         <div className={`absolute -left-[17px] top-0 h-8 w-8 rounded-full border-4 border-slate-50 flex items-center justify-center shadow-sm transition-transform group-hover:scale-110 ${item.color}`}>
                            <item.icon className="h-3.5 w-3.5" />
                         </div>
                         <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                           <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                             {new Date(item.date).toLocaleString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                           </span>
                           <span className="text-slate-300 text-[10px]">•</span>
                           <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-100">
                             <Building2 className="h-2.5 w-2.5 mr-1 text-blue-500" />
                             {item.companyName}
                           </span>
                         </div>
                         <div className="bg-white border border-slate-100 shadow-sm rounded-xl p-3 sm:p-4 group-hover:border-blue-200 transition-colors">
                            <p className="text-[12px] sm:text-[14px] font-bold text-slate-800">{item.title}</p>
                            <p className="text-[11px] sm:text-[12px] font-medium text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODAL: Announcements */}
        <AnimatePresence>
          {isAnnouncementModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAnnouncementModalOpen(false)}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center max-sm:px-4 max-sm:pt-20 max-sm:pb-[110px] sm:p-4 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} 
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-lg flex flex-col overflow-hidden border border-slate-100 h-full sm:h-[700px] sm:max-h-[85svh] mt-auto sm:mt-0"
              >
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-50 bg-[#FAFCFF] shrink-0">
                  <h3 className="text-[10px] sm:text-[13px] font-bold text-slate-800 uppercase tracking-wider">Manage Announcements</h3>
                  <button onClick={() => setIsAnnouncementModalOpen(false)} className="h-7 w-7 sm:h-8 sm:w-8 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm transition-colors"><X className="h-3.5 w-3.5 sm:h-4 sm:w-4"/></button>
                </div>
                
                <div className="p-4 sm:p-6 flex-1 overflow-y-auto flex flex-col max-sm:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <div className="flex-1 flex flex-col space-y-5 sm:space-y-6 mb-5 sm:mb-6">
                    <div className="space-y-4">
                      <div>
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1 sm:mb-2 px-1">Target Audience</label>
                        <select value={announcementForm.company_id} onChange={e => setAnnouncementForm({...announcementForm, company_id: e.target.value})} className="w-full h-10 sm:h-11 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium outline-none focus:border-blue-500 shadow-sm">
                          <option value="all">General (All Companies)</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1 sm:mb-2 px-1">Headline</label>
                        <input type="text" value={announcementForm.title} onChange={e => setAnnouncementForm({...announcementForm, title: e.target.value})} className="w-full h-10 sm:h-11 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium outline-none focus:border-blue-500 shadow-sm" placeholder="Important update..." />
                      </div>
                      <div>
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1 sm:mb-2 px-1">Message Content</label>
                        <textarea value={announcementForm.content} onChange={e => setAnnouncementForm({...announcementForm, content: e.target.value})} className="w-full h-20 sm:h-24 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 text-[12px] sm:text-[13px] font-medium outline-none focus:border-blue-500 shadow-sm resize-none" placeholder="Provide the details..." />
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto">
                    <h4 className="text-[9px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 sm:mb-4 px-1 border-b border-slate-100 pb-2">Active Broadcasts</h4>
                    <div className="space-y-2 sm:space-y-3">
                      {announcements.length === 0 && <p className="text-[11px] sm:text-sm text-slate-400 italic">No active announcements.</p>}
                      {announcements.map(ann => (
                        <div key={ann.id} className="bg-slate-50 border border-slate-100 p-2.5 sm:p-4 rounded-xl flex justify-between items-start gap-3 sm:gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                               <p className="font-bold text-slate-900 text-[12px] sm:text-sm">{ann.title}</p>
                               <span className="text-[7px] sm:text-[9px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-500 uppercase font-bold tracking-wider">{ann.company_id ? companies.find(c => c.id === ann.company_id)?.name || 'Specific' : 'General'}</span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-slate-600 mt-0.5 sm:mt-1">{ann.content}</p>
                            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1.5 sm:mt-2">{new Date(ann.created_at).toLocaleDateString()}</p>
                          </div>
                          <button onClick={() => handleDeleteAnnouncement(ann.id)} className="text-rose-500 hover:bg-rose-50 p-1.5 sm:p-2 rounded-lg transition-colors shrink-0"><Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4"/></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6 bg-white border-t border-slate-50 shrink-0 mt-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <button onClick={handlePostAnnouncement} disabled={isSavingAnnouncement} className="w-full bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl h-10 sm:h-12 font-bold text-[12px] sm:text-[13px] shadow-md shadow-blue-900/20 hover:shadow-lg transition-all flex items-center justify-center">
                      {isSavingAnnouncement ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/> Broadcasting...</> : "Broadcast Announcement"}
                    </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODAL: Edit/View Company */}
        <AnimatePresence>
          {isCompanyModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsCompanyModalOpen(false)}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center max-sm:px-4 max-sm:pt-20 max-sm:pb-[110px] sm:p-4 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} 
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-lg flex flex-col overflow-hidden border border-slate-100 h-full sm:h-[700px] sm:max-h-[85svh] mt-auto sm:mt-0"
              >
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-50 bg-[#FAFCFF] shrink-0">
                  <h3 className="text-[10px] sm:text-[13px] font-bold text-slate-800 uppercase tracking-wider">{companyModalMode === 'add' ? 'Add Company' : companyModalMode === 'edit' ? 'Edit Details' : 'Company Profile'}</h3>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {companyModalMode === 'view' && selectedCompany && (
                      <div className="flex sm:hidden items-center gap-1.5 mr-1 pr-2 border-r border-slate-200">
                        {selectedCompany.website_url && (
                          <a href={selectedCompany.website_url.startsWith('http') ? selectedCompany.website_url : `https://${selectedCompany.website_url}`} target="_blank" rel="noopener noreferrer" className="h-7 w-7 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-500 shadow-sm">
                            <Globe className="h-3.5 w-3.5"/>
                          </a>
                        )}
                        <button onClick={openEditCompany} className="h-7 w-7 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-500 shadow-sm">
                          <Edit3 className="h-3.5 w-3.5"/>
                        </button>
                      </div>
                    )}
                    <button onClick={() => setIsCompanyModalOpen(false)} className="h-7 w-7 sm:h-8 sm:w-8 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm transition-colors"><X className="h-3.5 w-3.5 sm:h-4 sm:w-4"/></button>
                  </div>
                </div>
                
                <div className="p-4 sm:p-6 flex-1 overflow-y-auto flex flex-col max-sm:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {companyModalMode === 'view' && selectedCompany ? (
                    <div className="flex-1 flex flex-col space-y-5 sm:space-y-6 pb-2 sm:pb-4">
                      <div className="flex items-center gap-3 sm:gap-5">
                        <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl sm:rounded-[1.25rem] bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden p-2 sm:p-3 shadow-sm shrink-0">
                          {selectedCompany.logo_url ? <img src={selectedCompany.logo_url} alt="Logo" className="h-full w-full object-contain" /> : <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-slate-300"/>}
                        </div>
                        <div>
                          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{selectedCompany.name}</h2>
                          <p className="text-[12px] sm:text-[13px] font-medium text-slate-500 mt-1">{selectedCompany.area}</p>
                          <span className="inline-block mt-2 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold uppercase tracking-widest border border-blue-100">
                            {businessTypes.find(t => t.slug === selectedCompany.business_type)?.label || 'Standard Corporate'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl sm:rounded-xl p-3 sm:p-4"><p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Personnel</p><p className="text-lg sm:text-2xl font-bold text-slate-800 tracking-tight">{employees.filter(e => e.company_id === selectedCompany.id).length}</p></div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl sm:rounded-xl p-3 sm:p-4"><p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Operations</p><p className="text-lg sm:text-2xl font-bold text-slate-800 tracking-tight">{projects.filter(p => p.company_id === selectedCompany.id).length}</p></div>
                        <div className="col-span-2 sm:col-span-1 bg-slate-50 border border-slate-100 rounded-xl sm:rounded-xl p-3 sm:p-4"><p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Payroll</p><p className="text-lg sm:text-2xl font-bold text-slate-800 tracking-tight">₹{selectedCompanyPayroll.toLocaleString()}</p></div>
                      </div>

                      <div className="space-y-3 sm:space-y-4 text-[12px] sm:text-[13px] bg-white border border-slate-100 shadow-sm rounded-xl sm:rounded-xl p-4 sm:p-5">
                        <div className="flex justify-between items-center"><span className="font-bold text-slate-400 uppercase tracking-wider text-[9px] sm:text-[10px]">Director</span><span className="font-bold text-slate-800">{selectedCompany.head_name || "Unassigned"}</span></div>
                        <div className="flex justify-between items-center pt-3 sm:pt-4 border-t border-slate-50"><span className="font-bold text-slate-400 uppercase tracking-wider text-[9px] sm:text-[10px]">Phone</span><span className="font-bold text-slate-800">{selectedCompany.phone || "--"}</span></div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col space-y-5 sm:space-y-6 pb-2 sm:pb-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-5 pb-4 sm:pb-5 border-b border-slate-100 w-full">
                        
                        <div className="relative shrink-0 mx-auto sm:mx-0">
                          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleLogoSelect} className="hidden" />
                          <div className="h-20 w-20 sm:h-20 sm:w-20 rounded-2xl sm:rounded-[1.25rem] border-[3px] border-white shadow-md bg-slate-50 flex flex-col items-center justify-center text-slate-300 overflow-hidden relative ring-4 ring-slate-50">
                            {displayLogo ? <img src={displayLogo} alt="Logo" className="h-full w-full object-contain p-2 sm:p-3" /> : <Building2 className="h-8 w-8 sm:h-8 sm:w-8 opacity-50"/>}
                          </div>
                          
                          <button 
                            type="button"
                            onClick={() => setShowLogoMenu(!showLogoMenu)} 
                            className="absolute -bottom-2 -right-2 h-8 w-8 sm:h-8 sm:w-8 bg-blue-600 border-2 border-white rounded-full flex items-center justify-center text-white hover:bg-blue-700 shadow-md transition-all active:scale-95 z-10"
                          >
                            <Edit3 className="h-3.5 w-3.5 sm:h-3.5 sm:w-3.5"/>
                          </button>

                          <AnimatePresence>
                            {showLogoMenu && (
                              <>
                                <div className="fixed inset-0 z-[10]" onClick={() => setShowLogoMenu(false)}></div>
                                <motion.div 
                                  initial={{ opacity: 0, y: 5, scale: 0.95 }} 
                                  animate={{ opacity: 1, y: 0, scale: 1 }} 
                                  exit={{ opacity: 0, y: 5, scale: 0.95 }} 
                                  transition={{ duration: 0.15 }}
                                  className="absolute top-full mt-3 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 w-44 sm:w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[50] py-1"
                                >
                                  <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-2 px-4 py-2.5 sm:py-3 text-[12px] sm:text-[13px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                                    <ImagePlus className="h-3.5 w-3.5 sm:h-4 sm:w-4"/> Upload Logo
                                  </button>
                                  {displayLogo && (
                                    <button type="button" onClick={handleRemoveLogo} className="w-full flex items-center gap-2 px-4 py-2.5 sm:py-3 text-[12px] sm:text-[13px] font-bold text-rose-600 hover:bg-rose-50 transition-colors border-t border-slate-50">
                                      <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4"/> Remove Logo
                                    </button>
                                  )}
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="flex-1 w-full">
                          <label className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1">Company Name</label>
                          <input type="text" value={companyFormData.name} onChange={(e) => setCompanyFormData({...companyFormData, name: e.target.value})} className="w-full h-12 sm:h-12 rounded-xl border border-slate-200 bg-white px-4 sm:px-4 text-[13px] sm:text-[14px] font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm" />
                        </div>
                      </div>

                      {/* WORKSPACE ARCHITECTURE DROPDOWN */}
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 sm:p-5">
                         <div className="flex items-start gap-3 mb-3">
                            <div className="h-8 w-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center shrink-0"><Layers className="h-4 w-4" /></div>
                            <div>
                               <p className="text-[11px] sm:text-[12px] font-bold text-slate-900">Workspace Architecture</p>
                               <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Defines the custom UI and operational workflow for this subsidiary.</p>
                            </div>
                         </div>
                         
                         <select 
                           value={showCustomTypeInput ? 'ADD_NEW' : companyFormData.business_type} 
                           onChange={(e) => {
                             if (e.target.value === 'ADD_NEW') {
                               setShowCustomTypeInput(true);
                             } else {
                               setShowCustomTypeInput(false);
                               setCompanyFormData({...companyFormData, business_type: e.target.value});
                             }
                           }}
                           className="w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-[12px] sm:text-[13px] font-bold outline-none focus:border-blue-500 shadow-sm cursor-pointer"
                         >
                           {businessTypes.map(type => (
                             <option key={type.slug} value={type.slug}>{type.label}</option>
                           ))}
                           <option value="ADD_NEW" className="font-bold text-blue-600">+ Add Custom Framework...</option>
                         </select>

                         {/* DYNAMIC CUSTOM TYPE INPUT */}
                         <AnimatePresence>
                           {showCustomTypeInput && (
                             <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                               <div className="mt-3">
                                 <input 
                                   type="text" 
                                   placeholder="e.g., Real Estate Agency" 
                                   value={customTypeLabel} 
                                   onChange={e => setCustomTypeLabel(e.target.value)} 
                                   className="w-full h-11 rounded-xl border border-blue-300 bg-blue-50 px-4 text-[12px] sm:text-[13px] font-bold outline-none focus:border-blue-500 shadow-sm placeholder:font-medium text-blue-900" 
                                   autoFocus
                                 />
                                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2 px-1">This will be permanently added to the global architecture list.</p>
                               </div>
                             </motion.div>
                           )}
                         </AnimatePresence>
                      </div>

                      {companyFormData.business_type !== 'parent' && (
                        <div className="grid grid-cols-2 gap-4 sm:gap-5">
                          <div><label className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Industry</label><input type="text" value={companyFormData.area} onChange={(e) => setCompanyFormData({...companyFormData, area: e.target.value})} className="w-full h-12 sm:h-12 rounded-xl border border-slate-200 bg-white px-4 sm:px-4 text-[13px] sm:text-[13px] font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm" /></div>
                          <div><label className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Director</label><input type="text" value={companyFormData.head_name} onChange={(e) => setCompanyFormData({...companyFormData, head_name: e.target.value})} className="w-full h-12 sm:h-12 rounded-xl border border-slate-200 bg-white px-4 sm:px-4 text-[13px] sm:text-[13px] font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm" /></div>
                          <div><label className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Phone</label><input type="text" value={companyFormData.phone} onChange={(e) => setCompanyFormData({...companyFormData, phone: e.target.value})} className="w-full h-12 sm:h-12 rounded-xl border border-slate-200 bg-white px-4 sm:px-4 text-[13px] sm:text-[13px] font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm" /></div>
                          <div><label className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Website URL</label><input type="url" value={companyFormData.website_url} onChange={(e) => setCompanyFormData({...companyFormData, website_url: e.target.value})} className="w-full h-12 sm:h-12 rounded-xl border border-slate-200 bg-white px-4 sm:px-4 text-[13px] sm:text-[13px] font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm" /></div>
                        </div>
                      )}

                      {companyFormData.business_type !== 'parent' && (
                        <div className="mt-5 border-t border-slate-100 pt-5">
                           <label className="flex items-center justify-between p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors bg-white shadow-sm">
                             <div>
                               <p className="text-[12px] sm:text-[13px] font-bold text-slate-800">Financial Access for Head</p>
                               <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 mt-0.5 max-w-[250px] sm:max-w-none">If ON, the head can view invoices, customer finances, and ledgers.</p>
                             </div>
                             <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${companyFormData.allow_head_finance ? 'bg-blue-600' : 'bg-slate-300'}`}>
                               <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${companyFormData.allow_head_finance ? 'translate-x-6' : 'translate-x-1'}`} />
                             </div>
                             <input type="checkbox" className="hidden" checked={companyFormData.allow_head_finance} onChange={(e) => setCompanyFormData({...companyFormData, allow_head_finance: e.target.checked})} />
                           </label>
                        </div>
                      )}

                    </div>
                  )}
                </div>

                <div className="p-3 sm:p-6 bg-white border-t border-slate-50 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {companyModalMode === 'view' && selectedCompany ? (
                    <div className="space-y-3">
                      <div className="hidden sm:flex flex-col sm:flex-row gap-2 sm:gap-3">
                        {selectedCompany.website_url && <a href={selectedCompany.website_url.startsWith('http') ? selectedCompany.website_url : `https://${selectedCompany.website_url}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center h-11 sm:h-11 rounded-xl bg-white text-slate-700 border border-slate-200 font-bold text-[12px] sm:text-[13px] hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all"><Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2 text-slate-400"/> Website</a>}
                        <button onClick={openEditCompany} className="flex-1 h-11 sm:h-11 flex items-center justify-center bg-white border border-slate-200 text-slate-700 font-bold text-[12px] sm:text-[13px] rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all"><Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2 text-slate-400"/> Edit Data</button>
                      </div>
                      <button onClick={handleEnterWorkspace} className="w-full bg-gradient-to-r from-blue-900 to-indigo-800 text-white hover:shadow-lg hover:-translate-y-0.5 rounded-xl h-10 sm:h-12 font-bold text-[12px] sm:text-[13px] transition-all flex items-center justify-center group shadow-md shadow-blue-900/20">
                        Enter Workspace <LogIn className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-2 group-hover:translate-x-1 transition-transform"/>
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 sm:gap-3">
                      {companyModalMode === 'edit' && <button onClick={handleDeleteCompany} disabled={saveStatus !== 'idle'} className="border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 rounded-xl h-10 sm:h-12 px-3 sm:px-4 flex items-center justify-center shadow-sm transition-colors shrink-0"><Trash2 className="h-3.5 w-3.5 sm:h-5 sm:w-5"/></button>}
                      <button type="button" onClick={() => companyModalMode === 'add' ? setIsCompanyModalOpen(false) : setCompanyModalMode("view")} className="flex-1 rounded-xl border border-slate-200 bg-white h-10 sm:h-12 font-bold text-[11px] sm:text-[13px] text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-colors">Cancel</button>
                      <button type="button" onClick={handleSaveCompany} disabled={saveStatus !== 'idle'} className="flex-1 bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl h-10 sm:h-12 font-bold text-[11px] sm:text-[13px] shadow-md shadow-blue-900/20 hover:shadow-lg transition-all flex items-center justify-center">
                        {saveStatus === 'compressing' && <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin"/> Compressing...</>}
                        {saveStatus === 'uploading' && <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin"/> Uploading...</>}
                        {saveStatus === 'saving' && <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin"/> Saving...</>}
                        {saveStatus === 'idle' && "Save Record"}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // --- RENDER USER ---
  return (
    <>
      <div className="max-w-[1000px] mx-auto space-y-8 sm:space-y-10 animate-in fade-in duration-700 relative z-0">
        
        {visibleAnnouncements.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl sm:rounded-3xl p-4 sm:p-5 relative overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600"/>
              <h3 className="text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase tracking-widest">Company Update</h3>
            </div>
            <AnimatePresence mode="wait">
               <motion.div key={safeAnnouncementIndex} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.3 }}>
                 <p className="font-bold text-slate-900 text-[14px] sm:text-base">{visibleAnnouncements[safeAnnouncementIndex].title}</p>
                 <p className="text-[13px] sm:text-sm text-slate-600 mt-1 leading-relaxed">{visibleAnnouncements[safeAnnouncementIndex].content}</p>
               </motion.div>
            </AnimatePresence>
          </div>
        )}

        <div className="pb-5 sm:pb-6 border-b border-slate-100 flex justify-between items-end gap-4">
          <div>
            <p className="text-[9px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-[0.3em] mb-2 sm:mb-3 bg-blue-50 inline-block px-3 py-1 rounded-full">Employee Dashboard</p>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-1 sm:mt-2 mb-1 sm:mb-2">
              Welcome, {firstName}
            </h1>
            <p className="text-[13px] sm:text-[14px] font-medium text-slate-500">
              View your projects, tasks, and recent payouts.
            </p>
          </div>
          
          {/* THE PULSE BUTTON (USER) */}
          <button onClick={() => setIsActivityModalOpen(true)} className="bg-white border border-slate-200 text-slate-700 shadow-sm hover:shadow-md px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-[12px] font-bold transition-all flex items-center shrink-0">
            <Activity className="h-3.5 w-3.5 sm:mr-1.5 text-blue-600"/> <span className="hidden sm:inline">Activity</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          
          <div className="lg:col-span-2">
            <h2 className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 sm:mb-4 px-1">My Projects</h2>
            
            {myProjects.length === 0 ? (
              <div className="border border-slate-200 border-dashed rounded-2xl sm:rounded-3xl h-32 sm:h-48 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest">No Assigned Projects</span>
              </div>
            ) : (
              <div className="border border-slate-100 shadow-sm rounded-2xl sm:rounded-3xl bg-white overflow-hidden">
                {myProjects.map((project, index) => {
                  const isCompleted = project.status === 'Completed';
                  return (
                    <div key={project.id} onClick={() => navigate('/projects')} className={`p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-5 cursor-pointer hover:bg-blue-50/50 transition-colors group ${index !== myProjects.length - 1 ? 'border-b border-slate-50' : ''}`}>
                      <div>
                        <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                          <span className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full shadow-sm ${isCompleted ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-blue-600 shadow-blue-600/50'}`}></span>
                          <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest ${isCompleted ? 'text-emerald-600' : 'text-blue-600'}`}>{project.status}</span>
                        </div>
                        <h3 className={`font-bold text-[14px] sm:text-[16px] tracking-tight group-hover:text-blue-900 transition-colors ${isCompleted ? 'text-slate-500' : 'text-slate-900'}`}>{project.name}</h3>
                      </div>
                      
                      <div className="flex items-center gap-4 sm:gap-6 sm:text-right">
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 sm:mb-1">Tasks</p>
                          <p className={`text-[13px] sm:text-[14px] font-bold ${isCompleted ? 'text-slate-400' : 'text-slate-800'}`}>{tasks.filter((t:any) => t.project_id === project.id && t.is_completed).length} / {tasks.filter((t:any) => t.project_id === project.id).length}</p>
                        </div>
                        {project.due_date && (
                          <div>
                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 sm:mb-1">Deadline</p>
                            <p className="text-[13px] sm:text-[14px] font-bold text-rose-500">{new Date(project.due_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</p>
                          </div>
                        )}
                        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all hidden sm:flex">
                          <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-900"/>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 sm:mb-4 px-1">Financial Status</h2>
            <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-800 text-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl min-h-[140px] sm:min-h-[180px] flex flex-col justify-between shadow-xl shadow-blue-900/10 relative overflow-hidden">
              <div className="absolute -right-10 -top-10 w-24 h-24 sm:w-40 sm:h-40 bg-white/5 rounded-full blur-3xl"></div>
              {lastSalary ? (
                <>
                  <div className="relative z-10">
                    <p className="text-[9px] sm:text-[10px] text-blue-200 font-bold uppercase tracking-widest mb-1.5 sm:mb-2">Latest Payout</p>
                    <div className="inline-flex items-center gap-1.5 text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md shadow-sm">
                      <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5"/>
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Disbursed</span>
                    </div>
                  </div>
                  <div className="relative z-10 mt-4 sm:mt-6">
                     <p className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">₹{lastSalary.amount.toLocaleString()}</p>
                     <p className="text-[9px] sm:text-[10px] text-blue-300 font-medium uppercase tracking-wider mt-1.5 sm:mt-2">Paid on: {new Date(lastSalary.payment_date).toLocaleDateString()}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="relative z-10">
                    <p className="text-[9px] sm:text-[10px] text-blue-200 font-bold uppercase tracking-widest mb-1.5 sm:mb-2">Next Payout</p>
                    <div className="inline-flex items-center gap-1.5 sm:gap-2 text-amber-300 bg-amber-400/10 border border-amber-400/20 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md">
                      <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5"/>
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Processing</span>
                    </div>
                  </div>
                  <div className="relative z-10 mt-4 sm:mt-6">
                     <p className="text-[12px] sm:text-[13px] text-blue-200 font-medium">Ledger unavailable.</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* USER PULSE MODAL */}
      <AnimatePresence>
        {isActivityModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setIsActivityModalOpen(false)}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center max-sm:px-4 max-sm:pt-20 max-sm:pb-[110px] sm:p-4 bg-slate-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} 
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-lg flex flex-col overflow-hidden border border-slate-100 h-full sm:h-[700px] sm:max-h-[85svh] mt-auto sm:mt-0"
            >
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-50 bg-[#FAFCFF] shrink-0">
                <div>
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full flex items-center inline-flex gap-1.5"><Activity className="h-3 w-3"/> System Pulse</span>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-1.5">Activity Feed</h3>
                </div>
                <button onClick={() => setIsActivityModalOpen(false)} className="h-7 w-7 sm:h-8 sm:w-8 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm transition-colors"><X className="h-3.5 w-3.5 sm:h-4 sm:w-4"/></button>
              </div>
              
              <div className="p-4 sm:p-8 flex-1 overflow-y-auto max-sm:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 sm:space-y-8 pb-4">
                  {pulseFeed.length === 0 ? (
                    <p className="text-[12px] sm:text-[14px] text-slate-400 italic pl-6">No recent activity detected.</p>
                  ) : pulseFeed.map(item => (
                    <div key={item.id} className="relative pl-8 group">
                       <div className={`absolute -left-[17px] top-0 h-8 w-8 rounded-full border-4 border-slate-50 flex items-center justify-center shadow-sm transition-transform group-hover:scale-110 ${item.color}`}>
                          <item.icon className="h-3.5 w-3.5" />
                       </div>
                       <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                         {new Date(item.date).toLocaleString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                       </p>
                       <div className="bg-white border border-slate-100 shadow-sm rounded-xl p-3 sm:p-4 group-hover:border-blue-200 transition-colors">
                          <p className="text-[12px] sm:text-[14px] font-bold text-slate-800">{item.title}</p>
                          <p className="text-[11px] sm:text-[12px] font-medium text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}