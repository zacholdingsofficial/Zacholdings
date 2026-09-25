import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Mail, Phone, Building2, Edit3, Trash2, X, Camera, Wallet, LayoutGrid, List, ShieldAlert, AlertCircle, CheckCircle2, Loader2, Briefcase } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useDataStore } from "../../store/dataStore";
import { supabase } from "../../supabase";

const compressImage = async (file: File, maxWidth = 300, quality = 0.8): Promise<File> => {
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

export default function EmployeesPage() {
  const { role, activeWorkspace, companyId } = useAuthStore();
  const { employees, companies, projectAllocations, salaryPayments, projects, fetchAllData } = useDataStore();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "compressing" | "uploading" | "saving">("idle");
  const [isSavingLedger, setIsSavingLedger] = useState(false);
  
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [ledgerEmployee, setLedgerEmployee] = useState<any>(null);
  
  const today = new Date().toISOString().split('T')[0];
  const [showEmpPaymentForm, setShowEmpPaymentForm] = useState(false);
  
  const [empPaymentForm, setEmpPaymentForm] = useState<{amount: string | number, payment_type: string, payment_date: string, notes: string, project_id: string}>({ 
    amount: "", payment_type: "Advance", payment_date: today, notes: "", project_id: "" 
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  const currentCompanyId = role === 'admin' ? (activeWorkspace || "") : companyId;

  const [formData, setFormData] = useState({
    name: "", 
    email: "", 
    phone: "", 
    password: "",
    company_roles: [{ company_id: currentCompanyId?.toString() || "", role: "", access_level: "user" }]
  });

  // MODIFIED: Accurately fetches the role for the exact company context Anupama is viewing
  const getPrimaryRoleAssignment = (emp: any) => {
    if (!emp.company_roles || emp.company_roles.length === 0) {
      return { company_id: emp.company_id, role: emp.role, access_level: emp.access_level };
    }
    
    // First, look for the exact company ID of the active workspace or Anupama's current login
    if (currentCompanyId) {
      const roleInCompany = emp.company_roles.find((cr: any) => cr.company_id?.toString() === currentCompanyId.toString());
      if (roleInCompany) return roleInCompany;
    }
    
    // Fallback logic for Global Admins viewing the "All Companies" dashboard
    const adminRole = emp.company_roles.find((cr: any) => cr.access_level === 'admin');
    return adminRole || emp.company_roles[0];
  };

  const visibleEmployees = employees.filter(emp => {
    const matchesSearch = emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) || (emp.email && emp.email.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const assignments = emp.company_roles && emp.company_roles.length > 0 
      ? emp.company_roles 
      : [{ company_id: emp.company_id, access_level: emp.access_level }];
      
    const hasGlobalAdmin = assignments.some((cr: any) => cr.access_level === 'admin');

    if (role === 'admin' && !activeWorkspace) {
      const matchesCompany = filterCompanyId === "all" || assignments.some((cr: any) => cr.company_id?.toString() === filterCompanyId);
      return matchesSearch && matchesCompany;
    }
    
    const matchesCurrentCompany = assignments.some((cr: any) => cr.company_id?.toString() === currentCompanyId?.toString());
    return matchesSearch && (matchesCurrentCompany || hasGlobalAdmin);
  }).sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : a.id;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : b.id;
    return timeA - timeB;
  });

  const getProjectDue = (empId: number, projectIdStr: string) => {
    if (!projectIdStr) return 0;
    const pid = parseInt(projectIdStr);
    const pAlloc = projectAllocations.filter(a => a.employee_id === empId && a.project_id === pid);
    const pPay = salaryPayments.filter(p => p.employee_id === empId && p.project_id === pid);
    const pAll = pAlloc.reduce((sum, a) => sum + (parseFloat(a.allocated_amount || 0) + parseFloat(a.incentive_amount || 0)), 0);
    const pPd = pPay.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    return Math.max(0, pAll - pPd);
  };

  const getFinancials = (empId: number) => {
    const allocs = projectAllocations.filter(a => a.employee_id === empId);
    const payments = salaryPayments.filter(p => p.employee_id === empId);
    const totalAllocated = allocs.reduce((sum, a) => sum + (parseFloat(a.allocated_amount || 0) + parseFloat(a.incentive_amount || 0)), 0);
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const balanceDue = Math.max(0, totalAllocated - totalPaid);
    return { totalAllocated, totalPaid, balanceDue, allocs, payments };
  };

  const openNewEmployee = () => {
    setSelectedEmployee(null);
    setFormData({ 
      name: "", email: "", phone: "", password: "", 
      company_roles: [{ company_id: currentCompanyId?.toString() || "", role: "", access_level: "user" }] 
    });
    setImageFile(null); setImagePreview(null); setRemoveImage(false);
    setIsModalOpen(true);
  };

  const openEditEmployee = (emp: any) => {
    setSelectedEmployee(emp);
    
    let initialRoles = [];
    if (emp.company_roles && emp.company_roles.length > 0) {
      initialRoles = emp.company_roles.map((cr: any) => ({
        company_id: cr.company_id?.toString() || "",
        role: cr.role || "",
        access_level: cr.access_level || "user"
      }));
    } else {
      initialRoles = [{
        company_id: emp.company_id?.toString() || "",
        role: emp.role || "",
        access_level: emp.access_level || "user"
      }];
    }

    setFormData({
      name: emp.name || "", 
      email: emp.email || "", 
      phone: emp.phone || "", 
      password: "",
      company_roles: initialRoles
    });
    setImageFile(null); setImagePreview(null); setRemoveImage(false);
    setIsModalOpen(true);
  };

  const openLedger = (emp: any) => {
    setLedgerEmployee(emp);
    setShowEmpPaymentForm(false);
    setEmpPaymentForm({ amount: "", payment_type: "Advance", payment_date: today, notes: "", project_id: "" });
    setIsLedgerOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); setRemoveImage(false); }
  };

  const deleteOldAvatar = async (url: string | null) => {
    if (!url) return;
    try {
      const urlParts = url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      if (fileName) await supabase.storage.from('avatars').remove([fileName]);
    } catch (e) {
      console.warn("Could not delete old avatar.");
    }
  };

  const addCompanyRoleForm = () => {
    setFormData({
      ...formData,
      company_roles: [...formData.company_roles, { company_id: "", role: "", access_level: "user" }]
    });
  };

  const removeCompanyRoleForm = (index: number) => {
    const newRoles = [...formData.company_roles];
    newRoles.splice(index, 1);
    setFormData({ ...formData, company_roles: newRoles });
  };

  const handleRoleChange = (index: number, field: string, value: string) => {
    const newRoles = [...formData.company_roles];
    newRoles[index] = { ...newRoles[index], [field]: value };
    setFormData({ ...formData, company_roles: newRoles });
  };

  const handleSaveEmployee = async () => {
    if (!formData.name.trim() || !formData.email.trim()) return alert("Name and Email are required.");
    if (!selectedEmployee && !formData.password.trim()) return alert("Initial password is required for new employees.");
    
    for (const cr of formData.company_roles) {
      if (!cr.company_id && cr.access_level !== 'admin' && (role === 'admin' && !activeWorkspace)) {
        return alert("Please select a company for all assigned roles.");
      }
    }

    setSaveStatus("saving");
    let finalImageUrl = selectedEmployee?.profile_image_url || null;

    try {
      if (removeImage || imageFile) {
        if (selectedEmployee?.profile_image_url) await deleteOldAvatar(selectedEmployee.profile_image_url);
        if (removeImage) finalImageUrl = null;
      }

      if (imageFile) {
        setSaveStatus("compressing");
        const compressedFile = await compressImage(imageFile, 300, 0.8);
        setSaveStatus("uploading");
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.jpg`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, compressedFile);
        if (uploadError) throw new Error(`Image upload failed! ${uploadError.message}`);
        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        finalImageUrl = data.publicUrl;
      }

      setSaveStatus("saving");
      
      const corePayload: any = {
        name: formData.name, 
        email: formData.email, 
        phone: formData.phone, 
        profile_image_url: finalImageUrl
      };

      let finalEmployeeId = selectedEmployee?.id;

      if (!selectedEmployee) {
        const { error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });
        if (authError) throw new Error(`Authentication Engine Error: ${authError.message}`);

        corePayload.password = formData.password; 
        const { data: newEmp, error } = await supabase.from('employees').insert([corePayload]).select().single();
        if (error) throw error;
        finalEmployeeId = newEmp.id;
      } else {
        const emailChanged = formData.email.trim().toLowerCase() !== selectedEmployee.email.trim().toLowerCase();
        const passwordChanged = formData.password.trim().length > 0;

        if (emailChanged || passwordChanged) {
           const { data: rpcResult, error: rpcError } = await supabase.rpc('admin_update_user_credentials', {
              old_email: selectedEmployee.email,
              new_email: formData.email.trim(),
              new_password: formData.password.trim() || null
           });
           if (rpcError) throw new Error(`Failed to contact Auth Vault: ${rpcError.message}`);
           if (rpcResult !== 'SUCCESS') throw new Error(`Auth Vault Error: ${rpcResult}`);
           if (passwordChanged) corePayload.password = formData.password; 
        }

        const { error } = await supabase.from('employees').update(corePayload).eq('id', finalEmployeeId);
        if (error) throw error;
      }

      const { error: deleteError } = await supabase.from('employee_company_roles').delete().eq('employee_id', finalEmployeeId);
      if (deleteError) throw deleteError;

      const validRolesToInsert = formData.company_roles
        .filter(cr => cr.company_id || cr.access_level === 'admin')
        .map(cr => ({
          employee_id: finalEmployeeId,
          company_id: cr.company_id ? parseInt(cr.company_id) : null,
          role: cr.role,
          access_level: cr.access_level
      }));

      if (validRolesToInsert.length > 0) {
        const { error: rolesError } = await supabase.from('employee_company_roles').insert(validRolesToInsert);
        if (rolesError) throw rolesError;
      }
      
      await fetchAllData();
      setIsModalOpen(false);
    } catch (error: any) { 
      alert(error.message); 
    } finally { 
      setSaveStatus("idle"); 
    }
  };

  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return;
    if (!window.confirm(`Are you sure you want to completely remove ${selectedEmployee.name}?`)) return;
    
    setSaveStatus("saving");
    try {
      if (selectedEmployee.profile_image_url) await deleteOldAvatar(selectedEmployee.profile_image_url);
      const { error } = await supabase.from('employees').delete().eq('id', selectedEmployee.id);
      if (error) throw error;
      await fetchAllData(); setIsModalOpen(false);
    } catch (error: any) { alert(error.message); } finally { setSaveStatus("idle"); }
  };

  const handleRecordEmployeePayment = async () => {
    const amountVal = parseFloat(empPaymentForm.amount.toString()) || 0;
    if (amountVal <= 0) return alert("Enter a valid amount.");
    
    setIsSavingLedger(true);
    try {
      let finalType = empPaymentForm.payment_type;
      let finalNotes = empPaymentForm.notes;

      if (empPaymentForm.project_id) {
        const projectDue = getProjectDue(ledgerEmployee.id, empPaymentForm.project_id);
        if (amountVal > projectDue && projectDue > 0) {
            finalType = `Bonus + ${empPaymentForm.payment_type}`;
            const bonusAmt = amountVal - projectDue;
            finalNotes = finalNotes 
                ? `${finalNotes} (Includes ₹${bonusAmt} Bonus)` 
                : `Includes ₹${bonusAmt} Extra/Bonus Payout`;
        }
      }

      const { error } = await supabase.from('salary_payments').insert([{
        employee_id: ledgerEmployee.id,
        company_id: ledgerEmployee.company_id || currentCompanyId, 
        project_id: empPaymentForm.project_id ? parseInt(empPaymentForm.project_id) : null,
        amount: amountVal,
        payment_type: finalType,
        payment_date: empPaymentForm.payment_date,
        payment_month: empPaymentForm.payment_date.substring(0, 7),
        notes: finalNotes
      }]);
      
      if (error) throw new Error(`Database Error: ${error.message}`);
      
      setEmpPaymentForm({ amount: "", payment_type: "Advance", payment_date: today, notes: "", project_id: "" });
      setShowEmpPaymentForm(false);
      await fetchAllData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSavingLedger(false);
    }
  };

  const handleDeletePaymentRecord = async (paymentId: number) => {
    if (!window.confirm("Remove this payment record permanently?")) return;
    try {
      const { error } = await supabase.from('salary_payments').delete().eq('id', paymentId);
      if (error) throw new Error(error.message);
      await fetchAllData();
    } catch (error: any) { alert(`Error deleting record: ${error.message}`); }
  };

  const displayImage = imagePreview || (!removeImage && selectedEmployee?.profile_image_url && selectedEmployee.profile_image_url.trim() !== "" ? selectedEmployee.profile_image_url : null);

  return (
    <>
      <div className="max-w-[1200px] mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-700 pb-8 relative z-0">
        
        <div className="absolute inset-0 pointer-events-none z-[-1] overflow-hidden print:hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4wOCkiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,white,transparent)]" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
          <div>
            <p className="text-[9px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-1.5 sm:mb-2 bg-blue-50 inline-block px-3 py-1 rounded-full">Team Management</p>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-1 sm:mt-2">Personnel.</h1>
          </div>
          {(role === 'admin' || role === 'head') && (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="bg-white p-1 rounded-xl sm:rounded-2xl flex items-center border border-slate-100 shadow-sm shrink-0">
                <button onClick={() => setViewMode('grid')} className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all ${viewMode === 'grid' ? 'bg-slate-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid className="h-4 w-4" /></button>
                <button onClick={() => setViewMode('list')} className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all ${viewMode === 'list' ? 'bg-slate-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><List className="h-4 w-4" /></button>
              </div>
              <button onClick={openNewEmployee} className="flex-1 sm:flex-none bg-gradient-to-r from-blue-900 to-indigo-800 text-white shadow-lg shadow-blue-900/20 hover:shadow-xl hover:-translate-y-0.5 px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-[13px] font-bold transition-all flex items-center justify-center shrink-0">
                <Plus className="h-4 w-4 mr-1.5 sm:mr-2" /> Add <span className="hidden sm:inline ml-1">Employee</span>
              </button>
            </div>
          )}
        </div>

        <div className="bg-white p-2 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 w-3.5 sm:w-4 text-slate-400" />
            <input type="text" placeholder="Search personnel..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-10 sm:h-11 pl-9 sm:pl-11 pr-4 rounded-lg sm:rounded-xl border-none text-[13px] sm:text-sm font-medium outline-none bg-transparent focus:ring-0 placeholder:text-slate-400" />
          </div>

          {role === 'admin' && !activeWorkspace && (
            <div className="sm:w-64 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-2">
              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                className="w-full h-10 sm:h-11 rounded-lg sm:rounded-xl bg-slate-50 border-none px-3 sm:px-4 text-[12px] sm:text-sm font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors focus:ring-4 focus:ring-blue-500/10 appearance-none"
                style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px' }}
              >
                <option value="all">All Companies</option>
                {companies.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {visibleEmployees.map(emp => {
              const { balanceDue } = getFinancials(emp.id);
              const isOwed = balanceDue > 0;
              const primaryAssignment = getPrimaryRoleAssignment(emp);
              
              return (
                <motion.div key={emp.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`bg-white rounded-2xl sm:rounded-3xl border shadow-sm hover:shadow-md transition-all flex flex-col relative overflow-hidden group ${isOwed ? 'border-amber-300 shadow-amber-100/50' : 'border-slate-100 hover:border-blue-200'}`}>
                  
                  <div className="absolute top-4 right-4 sm:top-5 sm:right-5 z-10 flex flex-col gap-1 items-end">
                    {primaryAssignment?.access_level === 'admin' ? <span className="bg-slate-900 text-white text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-2 sm:px-2.5 py-1 rounded-lg flex items-center gap-1"><ShieldAlert className="h-2.5 w-2.5 sm:h-3 sm:w-3"/> Admin</span>
                    : primaryAssignment?.access_level === 'head' ? <span className="bg-blue-50 text-blue-700 border border-blue-100 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-2 sm:px-2.5 py-1 rounded-lg">Director</span>
                    : <span className="bg-slate-50 text-slate-500 border border-slate-100 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-2 sm:px-2.5 py-1 rounded-lg">Operator</span>}
                    
                    {/* MODIFIED: The "+X Roles" badge is now restricted to only appear for Global Admins */}
                    {(role === 'admin' && !activeWorkspace) && emp.company_roles && emp.company_roles.length > 1 && (
                      <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg flex items-center gap-1">
                         <Briefcase className="h-2.5 w-2.5" /> +{emp.company_roles.length - 1} Roles
                      </span>
                    )}
                  </div>

                  <div className={`p-5 sm:p-7 flex flex-row sm:flex-col items-center sm:text-center mt-2 sm:mt-4 border-b relative ${isOwed ? 'border-amber-50 bg-amber-50/10' : 'border-slate-50'}`}>
                    <div className={`h-16 w-16 sm:h-20 sm:w-20 shrink-0 mr-4 sm:mr-0 rounded-[1rem] sm:rounded-full border-2 sm:border-4 shadow-sm flex items-center justify-center text-xl sm:text-2xl font-bold overflow-hidden mb-0 sm:mb-4 group-hover:scale-105 transition-transform ${isOwed ? 'border-amber-100 bg-amber-50 text-amber-500' : 'border-white bg-slate-50 text-slate-400'}`}>
                      {emp.profile_image_url && emp.profile_image_url.trim() !== "" ? <img src={emp.profile_image_url} alt="" className="h-full w-full object-cover" /> : (emp.name ? emp.name.charAt(0).toUpperCase() : 'U')}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col items-start sm:items-center">
                      <h3 className="text-[14px] sm:text-[16px] font-bold text-slate-900 tracking-tight leading-tight px-0 sm:px-2 truncate w-full sm:text-center">{emp.name}</h3>
                      <p className="text-[11px] sm:text-[12px] font-medium text-slate-500 mt-1 truncate w-full sm:text-center">{primaryAssignment?.role || 'Unassigned Role'}</p>
                      {role === 'admin' && !activeWorkspace && (
                         <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 sm:mt-3 flex items-center justify-start sm:justify-center gap-1 sm:gap-1.5 w-full truncate"><Building2 className="h-3 w-3 shrink-0" /> <span className="truncate">{companies.find(c => c.id.toString() === primaryAssignment?.company_id?.toString())?.name || 'Global'}</span></p>
                      )}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 flex items-center justify-between bg-[#FAFCFF] mt-auto">
                    <div className="min-w-0 pr-2">
                      <p className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-widest mb-0.5 ${isOwed ? 'text-amber-500 flex items-center gap-1' : 'text-slate-400'}`}>
                        {isOwed && <AlertCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />} <span className="truncate">Pending Payouts</span>
                      </p>
                      <p className={`text-[13px] sm:text-[15px] font-black truncate ${isOwed ? 'text-amber-600' : 'text-slate-900'}`}>₹{balanceDue.toLocaleString()}</p>
                    </div>
                    {(role === 'admin' || role === 'head') && (
                      <div className="flex gap-1.5 sm:gap-2 shrink-0">
                        <button onClick={() => openLedger(emp)} className="h-8 w-8 sm:h-9 sm:w-9 bg-emerald-50 text-emerald-600 rounded-lg sm:rounded-xl flex items-center justify-center hover:bg-emerald-100 transition-colors shadow-sm" title="Payment Ledger"><Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button>
                        <button onClick={() => openEditEmployee(emp)} className="h-8 w-8 sm:h-9 sm:w-9 bg-white border border-slate-200 text-slate-600 rounded-lg sm:rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors shadow-sm" title="Edit Data"><Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {viewMode === 'list' && (
          <div className="bg-white border border-slate-100 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full">
              <table className="w-full text-left text-xs sm:text-sm min-w-[600px]">
                <thead className="bg-[#FAFCFF] border-b border-slate-100">
                  <tr>
                    <th className="px-4 sm:px-6 py-4 sm:py-5 font-bold text-slate-400 uppercase tracking-widest text-[9px] sm:text-[10px] whitespace-nowrap">Personnel Info</th>
                    <th className="px-4 sm:px-6 py-4 sm:py-5 font-bold text-slate-400 uppercase tracking-widest text-[9px] sm:text-[10px] whitespace-nowrap">Contact</th>
                    <th className="px-4 sm:px-6 py-4 sm:py-5 font-bold text-slate-400 uppercase tracking-widest text-[9px] sm:text-[10px] whitespace-nowrap">Access Level</th>
                    <th className="px-4 sm:px-6 py-4 sm:py-5 font-bold text-slate-400 uppercase tracking-widest text-[9px] sm:text-[10px] whitespace-nowrap">Balance Due</th>
                    {(role === 'admin' || role === 'head') && <th className="px-4 sm:px-6 py-4 sm:py-5 font-bold text-slate-400 uppercase tracking-widest text-[9px] sm:text-[10px] text-right whitespace-nowrap">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 sm:px-6 py-8 sm:py-10 text-center text-slate-400 italic">No personnel found.</td>
                      </tr>
                  ) : visibleEmployees.map((emp) => {
                    const { balanceDue } = getFinancials(emp.id);
                    const isOwed = balanceDue > 0;
                    const primaryAssignment = getPrimaryRoleAssignment(emp);
                    
                    return (
                      <tr key={emp.id} className={`hover:bg-blue-50/30 transition-colors group ${isOwed ? 'bg-amber-50/10' : ''}`}>
                        <td className="px-4 sm:px-6 py-3 sm:py-4">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full border flex items-center justify-center text-[10px] sm:text-[12px] font-bold overflow-hidden shadow-sm shrink-0 ${isOwed ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                              {emp.profile_image_url && emp.profile_image_url.trim() !== "" ? <img src={emp.profile_image_url} alt="" className="h-full w-full object-cover" /> : (emp.name ? emp.name.charAt(0).toUpperCase() : 'U')}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-[12px] sm:text-[14px] text-slate-900 tracking-tight truncate">{emp.name}</p>
                              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">{primaryAssignment?.role || 'Unassigned Role'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-3 sm:py-4">
                          <p className="text-[11px] sm:text-[12px] text-slate-600 font-medium flex items-center gap-1.5 sm:gap-2 truncate"><Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400 shrink-0"/> <span className="truncate">{emp.email}</span></p>
                          {emp.phone && <p className="text-[11px] sm:text-[12px] text-slate-600 font-medium flex items-center gap-1.5 sm:gap-2 mt-1 truncate"><Phone className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400 shrink-0"/> <span className="truncate">{emp.phone}</span></p>}
                        </td>
                        <td className="px-4 sm:px-6 py-3 sm:py-4">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 sm:px-2.5 py-1 rounded-lg text-[8px] sm:text-[9px] font-bold uppercase tracking-widest whitespace-nowrap ${primaryAssignment?.access_level === 'admin' ? 'bg-slate-900 text-white' : primaryAssignment?.access_level === 'head' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                              {primaryAssignment?.access_level === 'head' ? 'Director' : primaryAssignment?.access_level === 'admin' ? 'Admin' : 'Operator'}
                            </span>
                            
                            {/* MODIFIED: The "+X Roles" badge is now restricted to only appear for Global Admins */}
                            {(role === 'admin' && !activeWorkspace) && emp.company_roles && emp.company_roles.length > 1 && (
                              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">+{emp.company_roles.length - 1}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-3 sm:py-4">
                          <div className="flex flex-col">
                              <p className={`font-black text-[12px] sm:text-[14px] whitespace-nowrap ${isOwed ? 'text-amber-600' : 'text-slate-900'}`}>₹{balanceDue.toLocaleString()}</p>
                              {isOwed && <p className="text-[8px] sm:text-[9px] font-bold text-amber-500 uppercase tracking-widest mt-0.5 flex items-center gap-1 whitespace-nowrap"><AlertCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3"/> Pending Payouts</p>}
                          </div>
                        </td>
                        {(role === 'admin' || role === 'head') && (
                          <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                            <div className="flex justify-end gap-1.5 sm:gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openLedger(emp)} className="h-7 w-7 sm:h-8 sm:w-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-100 transition-colors" title="Payment Ledger"><Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button>
                              <button onClick={() => openEditEmployee(emp)} className="h-7 w-7 sm:h-8 sm:w-8 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center justify-center hover:bg-slate-50 transition-colors" title="Edit Data"><Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <AnimatePresence>
          {isModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center max-sm:px-4 max-sm:pt-20 max-sm:pb-[110px] sm:p-4 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ opacity: 0, y: 40, scale: 0.95 }} 
                animate={{ opacity: 1, y: 0, scale: 1 }} 
                exit={{ opacity: 0, y: 40, scale: 0.95 }} 
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-100"
              >
                
                <div className="px-5 sm:px-8 pt-5 sm:pt-7 border-b border-slate-100 bg-[#FAFCFF] shrink-0">
                  <div className="flex items-center justify-between mb-4 sm:mb-5">
                    <div>
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2 sm:px-2.5 py-1 rounded-full">HR Record</span>
                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-1.5">{selectedEmployee ? 'Edit Data' : 'Add Employee'}</h3>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="h-8 w-8 sm:h-9 sm:w-9 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm transition-colors"><X className="h-3.5 w-3.5 sm:h-4 w-4" /></button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-8 flex flex-col lg:flex-row gap-6 sm:gap-10 max-sm:[&::-webkit-scrollbar]:hidden max-sm:[-ms-overflow-style:none] max-sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar-thumb]:bg-slate-200 sm:[&::-webkit-scrollbar-thumb]:rounded-full">
                  
                  <div className="flex flex-row items-center sm:items-start gap-4 sm:gap-0 sm:flex-col shrink-0 border-b sm:border-b-0 border-slate-100 pb-5 sm:pb-0 sm:w-64">
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} className="hidden" />
                    <div className="relative group shrink-0">
                      <div onClick={() => fileInputRef.current?.click()} className="h-16 w-16 sm:h-40 sm:w-40 rounded-[1rem] sm:rounded-full border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-all overflow-hidden shadow-sm relative">
                        {displayImage ? <img src={displayImage} alt="Profile" className="h-full w-full object-cover" /> : <div className="flex flex-col items-center"><Camera className="h-5 w-5 sm:h-6 sm:w-6 mb-1 sm:mb-2 opacity-50" /><span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest hidden sm:block">Photo</span></div>}
                      </div>
                      {displayImage && <button onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); setRemoveImage(true); }} className="absolute -bottom-1 -right-1 sm:bottom-2 sm:right-2 h-6 w-6 sm:h-10 sm:w-10 bg-white border border-slate-100 rounded-full flex items-center justify-center text-rose-500 hover:bg-rose-50 shadow-lg sm:opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="h-3 w-3 sm:h-4 sm:w-4" /></button>}
                    </div>

                    <div className="flex-1 flex flex-col gap-2 sm:hidden">
                      <div>
                         <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1 px-1">Full Name *</label>
                         <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-bold outline-none focus:border-blue-500 shadow-sm" />
                      </div>
                      <div>
                         <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1 px-1">Email Address *</label>
                         <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-medium outline-none focus:border-blue-500 shadow-sm" />
                      </div>
                    </div>
                    <div className="hidden sm:block text-center mt-5 px-4">
                       <p className="text-[11px] text-slate-400 font-medium leading-relaxed">Upload a clear, professional photo for the directory.</p>
                    </div>
                  </div>

                  <div className="flex-1 space-y-4 sm:space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                      <div className="hidden sm:block">
                         <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">Full Name *</label>
                         <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full h-12 rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-500 shadow-sm" />
                      </div>
                      <div className="hidden sm:block">
                         <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">Email Address *</label>
                         <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full h-12 rounded-xl border border-slate-200 px-4 text-sm font-medium outline-none focus:border-blue-500 shadow-sm" />
                      </div>
                      <div>
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1">Contact Number</label>
                        <input type="text" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 px-3 sm:px-4 text-[12px] sm:text-sm font-medium outline-none focus:border-blue-500 shadow-sm" />
                      </div>
                      <div>
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1 truncate" title={selectedEmployee ? 'System Access' : 'Sys Password *'}>Sys Password {selectedEmployee ? '(Opt)' : '*'}</label>
                        <input type="text" placeholder={selectedEmployee ? "Leave blank..." : "Set initial pwd"} value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 px-3 sm:px-4 text-[12px] sm:text-sm font-medium outline-none focus:border-blue-500 shadow-sm placeholder:truncate" />
                      </div>
                    </div>

                    <div className="mt-6 border-t border-slate-100 pt-6">
                      <div className="flex items-center justify-between mb-4">
                         <h4 className="text-[11px] sm:text-[12px] font-bold text-slate-800 tracking-tight flex items-center gap-2"><Briefcase className="h-4 w-4 text-blue-600"/> Company Assignments</h4>
                         <button onClick={addCompanyRoleForm} className="text-[10px] font-bold bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1"><Plus className="h-3 w-3" /> Add Role</button>
                      </div>
                      
                      <div className="space-y-4">
                        {formData.company_roles.map((cr, idx) => (
                           <div key={idx} className="p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-slate-50 border border-slate-200 relative group">
                             {formData.company_roles.length > 1 && (
                               <button onClick={() => removeCompanyRoleForm(idx)} className="absolute -top-2 -right-2 h-6 w-6 bg-white border border-rose-100 rounded-full flex items-center justify-center text-rose-500 hover:bg-rose-50 shadow-sm z-10"><X className="h-3 w-3" /></button>
                             )}
                             
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                               {(role === 'admin' && !activeWorkspace) && (
                                 <div className="sm:col-span-2">
                                   <label className="text-[9px] sm:text-[10px] font-bold text-slate-600 uppercase tracking-widest block mb-2 px-1">Company / Subsidiary</label>
                                   <select value={cr.company_id} onChange={(e) => handleRoleChange(idx, 'company_id', e.target.value)} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-sm font-bold outline-none cursor-pointer focus:border-blue-500">
                                     <option value="">Global Administrator (No specific company)</option>
                                     {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                   </select>
                                 </div>
                               )}
                               
                               <div>
                                 <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Job Title</label>
                                 <input type="text" placeholder="e.g., Faculty, Manager" value={cr.role} onChange={(e) => handleRoleChange(idx, 'role', e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 px-3 text-[12px] sm:text-sm font-medium outline-none bg-white focus:border-blue-500 shadow-sm" />
                               </div>
                               <div>
                                  <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 px-1">Access Level</label>
                                  <select value={cr.access_level} onChange={(e) => handleRoleChange(idx, 'access_level', e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[12px] sm:text-sm font-bold outline-none cursor-pointer focus:border-blue-500">
                                      <option value="user">Operator (User)</option>
                                      <option value="head">Director (Head)</option>
                                      {role === 'admin' && <option value="admin">Global Admin</option>}
                                  </select>
                               </div>
                             </div>
                           </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6 border-t border-slate-100 bg-[#FAFCFF] flex justify-end items-center gap-2 sm:gap-4 shrink-0">
                  {selectedEmployee && <button onClick={handleDeleteEmployee} disabled={saveStatus !== 'idle'} className="border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 rounded-xl h-10 sm:h-12 px-3 sm:px-5 shadow-sm mr-auto"><Trash2 className="h-4 w-4" /></button>}
                  <button onClick={() => setIsModalOpen(false)} className="rounded-xl border border-slate-200 bg-white h-10 sm:h-12 px-4 sm:px-8 font-bold text-[12px] sm:text-sm text-slate-600 hover:bg-slate-50 shadow-sm flex-1 sm:flex-none">Cancel</button>
                  <button onClick={handleSaveEmployee} disabled={saveStatus !== 'idle'} className="bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl h-10 sm:h-12 px-6 sm:px-10 font-bold text-[12px] sm:text-sm shadow-md hover:shadow-lg transition-all flex-1 sm:flex-none flex items-center justify-center">
                     {saveStatus === 'compressing' && <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Compressing...</>}
                     {saveStatus === 'uploading' && <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Uploading...</>}
                     {saveStatus === 'saving' && <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Saving...</>}
                     {saveStatus === 'idle' && "Save Record"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isLedgerOpen && ledgerEmployee && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsLedgerOpen(false)}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center max-sm:px-4 max-sm:pt-20 max-sm:pb-[110px] sm:p-4 bg-slate-900/40 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ opacity: 0, y: 40, scale: 0.95 }} 
                animate={{ opacity: 1, y: 0, scale: 1 }} 
                exit={{ opacity: 0, y: 40, scale: 0.95 }} 
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-full sm:max-h-[85svh] flex flex-col overflow-hidden border border-slate-100"
              >
                
                <div className="p-6 sm:p-8 text-center bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 relative shrink-0">
                  <div className="absolute top-4 sm:top-6 right-4 sm:right-6 flex gap-2">
                    {(role === 'admin' || role === 'head') && (
                      <button onClick={() => setShowEmpPaymentForm(true)} className="h-8 w-8 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-emerald-600 hover:bg-emerald-100 shadow-sm transition-colors" title="Issue Payout">
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => setIsLedgerOpen(false)} className="h-8 w-8 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm transition-colors"><X className="h-4 w-4" /></button>
                  </div>

                  <div className="h-14 w-14 sm:h-16 sm:w-16 mx-auto bg-white rounded-full flex items-center justify-center mb-3 sm:mb-4 border border-slate-200 shadow-sm overflow-hidden text-lg sm:text-xl font-bold text-slate-400">
                    {ledgerEmployee.profile_image_url ? <img src={ledgerEmployee.profile_image_url} className="h-full w-full object-cover"/> : (ledgerEmployee.name ? ledgerEmployee.name.charAt(0) : 'U')}
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">{ledgerEmployee.name}'s Ledger</h3>
                  <p className="text-[9px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Payment Ledger</p>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-8 space-y-6 sm:space-y-8 bg-white max-sm:[&::-webkit-scrollbar]:hidden max-sm:[-ms-overflow-style:none] max-sm:[scrollbar-width:none]">
                  {(() => {
                    const { totalAllocated, totalPaid, balanceDue, payments } = getFinancials(ledgerEmployee.id);
                    
                    const assignedProjectIds = projectAllocations
                      .filter(a => a.employee_id === ledgerEmployee.id)
                      .map(a => a.project_id);
                    const assignedProjects = projects.filter(p => assignedProjectIds.includes(p.id) && (p.company_id === ledgerEmployee.company_id || role === 'admin'));

                    return (
                      <>
                        {(role === 'admin' || role === 'head') && showEmpPaymentForm && (
                           <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 sm:p-6 mb-6">
                              <h4 className="text-[10px] sm:text-[11px] font-bold text-emerald-800 uppercase tracking-widest mb-3 sm:mb-4">Record New Transaction</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-5">
                                 <div className="flex flex-col justify-start">
                                    <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1">Amount (₹) *</label>
                                    <input type="number" value={empPaymentForm.amount} onChange={e=>setEmpPaymentForm({...empPaymentForm, amount: e.target.value})} className="w-full h-10 sm:h-11 border border-emerald-200 rounded-xl px-3 outline-none focus:border-emerald-500 font-black text-emerald-700 bg-white" />
                                    
                                    <AnimatePresence>
                                        {empPaymentForm.project_id && (
                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                                {(() => {
                                                    const due = getProjectDue(ledgerEmployee.id, empPaymentForm.project_id);
                                                    const entered = parseFloat(empPaymentForm.amount.toString()) || 0;
                                                    const remaining = due - entered;
                                                    
                                                    if (remaining > 0) return <p className="text-[10px] font-bold mt-1.5 flex items-center gap-1 text-amber-600"><AlertCircle className="h-3 w-3" /> Remaining Due: ₹{remaining.toLocaleString()}</p>;
                                                    if (remaining === 0) return <p className="text-[10px] font-bold mt-1.5 flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Fully Settled</p>;
                                                    return <p className="text-[10px] font-bold mt-1.5 flex items-center gap-1 text-indigo-600"><CheckCircle2 className="h-3 w-3" /> Due: ₹0 | Bonus: ₹{Math.abs(remaining).toLocaleString()}</p>;
                                                })()}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                 </div>
                                 
                                 <div>
                                    <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1">Date</label>
                                    <input type="date" value={empPaymentForm.payment_date} onChange={e=>setEmpPaymentForm({...empPaymentForm, payment_date: e.target.value})} className="w-full h-10 sm:h-11 border border-emerald-200 rounded-xl px-3 outline-none focus:border-emerald-500 font-medium text-[12px] sm:text-sm bg-white" />
                                 </div>
                                 
                                 <div>
                                    <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1">Type</label>
                                    <select value={empPaymentForm.payment_type} onChange={e=>setEmpPaymentForm({...empPaymentForm, payment_type: e.target.value})} className="w-full h-10 sm:h-11 border border-emerald-200 rounded-xl px-3 outline-none focus:border-emerald-500 font-bold text-[12px] sm:text-sm bg-white cursor-pointer">
                                        <option>Advance</option>
                                        <option>Installment</option>
                                        <option>Final Payout</option>
                                        <option>Incentive / Bonus</option>
                                        <option>General Reimbursement</option>
                                    </select>
                                 </div>
                                 
                                 <div>
                                    <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1 truncate">Link Project (Assigned Only)</label>
                                    <select 
                                        value={empPaymentForm.project_id} 
                                        onChange={e => {
                                            const pid = e.target.value;
                                            let newAmount = empPaymentForm.amount;
                                            if (pid) {
                                                const due = getProjectDue(ledgerEmployee.id, pid);
                                                if (due > 0) newAmount = due.toString();
                                            }
                                            setEmpPaymentForm({...empPaymentForm, project_id: pid, amount: newAmount});
                                        }} 
                                        className="w-full h-10 sm:h-11 border border-emerald-200 rounded-xl px-3 outline-none focus:border-emerald-500 font-medium text-[12px] sm:text-sm bg-white cursor-pointer"
                                    >
                                        <option value="">-- General Payment --</option>
                                        {assignedProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                 </div>
                                 
                                 <div className="sm:col-span-2 mt-1">
                                    <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1">Notes / Ref (Optional)</label>
                                    <input type="text" placeholder="Bank ref, details..." value={empPaymentForm.notes} onChange={e=>setEmpPaymentForm({...empPaymentForm, notes: e.target.value})} className="w-full h-10 sm:h-11 border border-emerald-200 rounded-xl px-3 outline-none focus:border-emerald-500 font-medium text-[12px] sm:text-sm bg-white" />
                                 </div>
                              </div>
                              <div className="flex justify-end gap-2 mt-2">
                                 <button onClick={() => setShowEmpPaymentForm(false)} className="h-10 px-4 sm:px-5 text-[11px] sm:text-xs font-bold text-slate-500 hover:bg-white rounded-xl border border-slate-200 transition-colors flex-1 sm:flex-none">Cancel</button>
                                 <button onClick={handleRecordEmployeePayment} disabled={isSavingLedger} className="h-10 px-4 sm:px-8 text-[11px] sm:text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:shadow-lg hover:-translate-y-0.5 rounded-xl shadow-md transition-all flex-1 sm:flex-none flex items-center justify-center">
                                   {isSavingLedger ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Processing...</> : 'Record Payment'}
                                 </button>
                              </div>
                           </div>
                        )}

                        <div className="grid grid-cols-3 gap-2 sm:gap-4">
                           <div className="bg-slate-50 rounded-xl sm:rounded-2xl p-3 sm:p-5 text-center border border-slate-100">
                              <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-1.5">Total Earned</p>
                              <p className="text-[13px] sm:text-xl font-black text-slate-800">₹{totalAllocated.toLocaleString()}</p>
                           </div>
                           <div className="bg-emerald-50 rounded-xl sm:rounded-2xl p-3 sm:p-5 text-center border border-emerald-100">
                              <p className="text-[8px] sm:text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-1 sm:mb-1.5">Total Paid</p>
                              <p className="text-[13px] sm:text-xl font-black text-emerald-700">₹{totalPaid.toLocaleString()}</p>
                           </div>
                           <div className={`rounded-xl sm:rounded-2xl p-3 sm:p-5 text-center border ${balanceDue > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                              <p className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-widest mb-1 sm:mb-1.5 ${balanceDue > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Balance Due</p>
                              <p className={`text-[13px] sm:text-xl font-black ${balanceDue > 0 ? 'text-amber-600' : 'text-slate-400'}`}>₹{balanceDue.toLocaleString()}</p>
                           </div>
                        </div>

                        <div>
                          <h4 className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 sm:mb-4 border-b border-slate-100 pb-2">Recent Transactions</h4>
                          <div className="space-y-2 sm:space-y-3">
                             {payments.length === 0 ? <p className="text-[12px] sm:text-sm italic text-slate-400 text-center py-4">No payments recorded yet.</p> : 
                              payments.sort((a,b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()).map(p => (
                                <div key={p.id} className="flex justify-between items-center bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-100 group">
                                   <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-2">
                                      <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" /></div>
                                      <div className="min-w-0">
                                        <p className="text-[12px] sm:text-[13px] font-bold text-slate-900 truncate">{p.project_id ? projects.find(proj => proj.id === p.project_id)?.name : 'General / Misc Payment'}</p>
                                        <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase tracking-widest mt-0.5 truncate">{p.payment_date ? new Date(p.payment_date).toLocaleDateString() : 'N/A'} • {p.payment_type} {p.notes && `• Ref: ${p.notes}`}</p>
                                      </div>
                                   </div>
                                   <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                      <p className="text-[13px] sm:text-[15px] font-black text-emerald-600">+ ₹{parseFloat(p.amount || 0).toLocaleString()}</p>
                                      {(role === 'admin' || role === 'head') && (
                                         <button onClick={() => handleDeletePaymentRecord(p.id)} className="sm:opacity-0 group-hover:opacity-100 transition-opacity text-rose-400 hover:text-rose-600 bg-rose-50 p-1.5 rounded-lg" title="Delete Payment">
                                            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                         </button>
                                      )}
                                   </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </>
  );
}