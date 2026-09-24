import { useState, useRef, useEffect } from "react";
import { Save, Lock, User, Shield, CheckCircle2, Trash2, Edit3, ImagePlus, Eye, EyeOff, XCircle, Check, Loader2, HardDrive, Download, Calendar, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../../store/authStore";
import { useDataStore } from "../../store/dataStore";
import { supabase } from "../../supabase";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

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

export default function SettingsPage() {
  const { user, employeeId, role, activeWorkspace, companyId } = useAuthStore();
  const { employees, projects, customers, invoices, expenses, salaryPayments, companies, fetchAllData } = useDataStore();
  
  const [saveStatus, setSaveStatus] = useState<"idle" | "compressing" | "uploading" | "saving">("idle");
  const [isSuccess, setIsSuccess] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const currentEmployee = employees.find(e => e.id === employeeId);
  const [formData, setFormData] = useState({ name: "", newPassword: "" });

  const isGlobalAdmin = role === 'admin' && !activeWorkspace;
  const currentCompanyId = isGlobalAdmin ? null : (activeWorkspace || companyId);

  const [backupTarget, setBackupTarget] = useState<string>(isGlobalAdmin ? "all" : (currentCompanyId?.toString() || ""));
  const [backupStartDate, setBackupStartDate] = useState<string>("");
  const [backupEndDate, setBackupEndDate] = useState<string>("");

  useEffect(() => {
    if (currentEmployee) {
      setFormData(prev => ({ ...prev, name: currentEmployee.name || "" }));
      setImagePreview(currentEmployee.profile_image_url || null);
      setRemoveImage(false);
    }
  }, [currentEmployee]);

  const reqLength = formData.newPassword.length >= 6;
  const reqUpper = /[A-Z]/.test(formData.newPassword);
  const reqNumber = /[0-9]/.test(formData.newPassword);
  const reqSpecial = /[^A-Za-z0-9]/.test(formData.newPassword);
  const isPasswordValid = formData.newPassword.length === 0 || (reqLength && reqUpper && reqNumber && reqSpecial);

  const hasUnsavedChanges = 
    formData.name.trim() !== (currentEmployee?.name || "").trim() ||
    formData.newPassword.length > 0 ||
    imageFile !== null ||
    removeImage;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) { 
      setImageFile(e.target.files[0]); 
      setImagePreview(URL.createObjectURL(e.target.files[0])); 
      setRemoveImage(false); 
      setShowPhotoMenu(false);
    }
  };

  const handleRemovePhoto = () => { 
    setImageFile(null); 
    setImagePreview(null); 
    setRemoveImage(true); 
    setShowPhotoMenu(false);
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

  const handleSaveSettings = async () => {
    if (!formData.name.trim()) return alert("Name cannot be empty.");
    if (!isPasswordValid) return alert("Please meet all password requirements.");
    
    setSaveStatus("saving"); 
    setIsSuccess(false);

    try {
      let avatarUrl = currentEmployee?.profile_image_url || null;

      if (imageFile || removeImage) {
        if (currentEmployee?.profile_image_url) {
          await deleteOldAvatar(currentEmployee.profile_image_url);
        }
      }

      if (imageFile) {
        setSaveStatus("compressing");
        const compressedFile = await compressImage(imageFile, 400, 0.8);
        
        setSaveStatus("uploading");
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.jpg`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, compressedFile);
        if (!uploadError) { 
          const { data } = supabase.storage.from('avatars').getPublicUrl(fileName); 
          avatarUrl = data.publicUrl; 
        }
      } else if (removeImage) {
        avatarUrl = null;
      }

      setSaveStatus("saving");
      await supabase.from('employees').update({ name: formData.name, profile_image_url: avatarUrl }).eq('id', employeeId);

      if (formData.newPassword) {
        await supabase.auth.updateUser({ password: formData.newPassword });
        setFormData(prev => ({ ...prev, newPassword: "" }));
      }

      await fetchAllData(); 
      setImageFile(null);
      setRemoveImage(false);
      
      setSaveStatus("idle");
      setIsSuccess(true); 
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (error: any) { alert(`Error updating: ${error.message}`); setSaveStatus("idle"); }
  };

  const filterData = (data: any[], dateField: string = 'created_at') => {
    return data.filter(item => {
      if (backupTarget !== "all" && item.company_id?.toString() !== backupTarget) return false;
      if (backupStartDate || backupEndDate) {
        const itemDate = new Date(item[dateField] || item.created_at);
        if (backupStartDate && itemDate < new Date(backupStartDate)) return false;
        if (backupEndDate && itemDate > new Date(backupEndDate + 'T23:59:59')) return false;
      }
      return true;
    });
  };

  // --- PREMIUM EXCEL FORMATTING ENGINE ---
  const applyPremiumStyle = (sheet: ExcelJS.Worksheet, data: any[], title: string) => {
    if (data.length === 0) {
      sheet.addRow(['No records found for this period.']);
      return;
    }

    const headers = Object.keys(data[0]);

    // 1. Report Title Row
    sheet.mergeCells(1, 1, 1, headers.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `${title.toUpperCase()} REPORT`;
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Tailwind slate-900
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 35;

    // 2. Metadata Row
    sheet.mergeCells(2, 1, 2, headers.length);
    const metaCell = sheet.getCell(2, 1);
    metaCell.value = `Data Backup Exported: ${new Date().toLocaleString()} | Zac Holdings ERP`;
    metaCell.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF475569' } }; // slate-600
    metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; // slate-50
    metaCell.alignment = { vertical: 'middle', horizontal: 'right' };
    sheet.getRow(2).height = 20;

    // 3. Spacer
    sheet.addRow([]);

    // 4. Headers Row
    const headerRow = sheet.addRow(headers);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Tailwind blue-600
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10, name: 'Segoe UI' };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1D4ED8' } },
        bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
        left: { style: 'thin', color: { argb: 'FF1D4ED8' } },
        right: { style: 'thin', color: { argb: 'FF1D4ED8' } }
      };
    });

    // 5. Data Rows Formatting
    data.forEach((rowData, index) => {
      const row = sheet.addRow(Object.values(rowData));
      row.height = 22;
      const isAlt = index % 2 === 0;
      
      row.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? 'FFFFFFFF' : 'FFF8FAFC' } };
        cell.font = { color: { argb: 'FF334155' }, size: 9, name: 'Segoe UI' };
        
        const headerName = headers[colNum - 1];
        if (headerName.includes('(₹)') && typeof cell.value === 'number') {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '"₹"#,##0.00'; 
        } else if (headerName.includes('Date') || headerName.includes('On')) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
        }

        cell.border = {
          bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } },
          left: { style: 'hair', color: { argb: 'FFCBD5E1' } },
          right: { style: 'hair', color: { argb: 'FFCBD5E1' } }
        };
      });
    });

    // 6. Intelligent Column Sizing (FIXED STRICT TYPING)
    headers.forEach((_, index) => {
      const column = sheet.getColumn(index + 1);
      let maxLength = 0;
      
      column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
        if (rowNumber > 3) { // Skip title and meta rows
          const val = cell.value ? cell.value.toString() : '';
          if (val.length > maxLength) maxLength = val.length;
        }
      });
      
      column.width = Math.min(Math.max(maxLength + 4, 15), 45); // Clamp widths
    });
  };

  const handleDownloadBackup = async () => {
    try {
      setSaveStatus("saving");
      
      const scopedProjects = filterData(projects, 'created_at');
      const scopedEmployees = filterData(employees, 'created_at');
      const scopedCustomers = filterData(customers, 'created_at');
      const scopedInvoices = filterData(invoices, 'issue_date');
      const scopedExpenses = filterData(expenses, 'expense_date');
      const scopedPayments = filterData(salaryPayments, 'payment_date');

      const humanProjects = scopedProjects.map(p => ({
        "Project Name": p.name, "Status": p.status, "Priority": p.priority,
        "Client": customers.find(c => c.id === p.customer_id)?.name || "Internal / Unassigned",
        "Expected Value (₹)": p.expected_amount,
        "Due Date": p.due_date ? new Date(p.due_date).toLocaleDateString() : "N/A",
        "Created On": new Date(p.created_at).toLocaleDateString()
      }));

      const humanEmployees = scopedEmployees.map(e => ({
        "Full Name": e.name, "Email": e.email, "Phone": e.phone || "N/A",
        "Job Role": e.role || "N/A", "System Access": e.access_level.toUpperCase()
      }));

      const humanCustomers = scopedCustomers.map(c => ({
        "Company Name": c.name, "Primary Contact": c.contact_person || "N/A",
        "Email": c.email || "N/A", "Phone": c.phone || "N/A", "Registered Address": c.address || "N/A"
      }));

      const humanInvoices = scopedInvoices.map(i => ({
        "Invoice No": i.invoice_number,
        "Linked Project": projects.find(p => p.id === i.project_id)?.name || "General Ledger",
        "Current Status": i.status,
        "Total Billed (₹)": i.total_amount,
        "Amount Paid (₹)": i.amount_paid,
        "Issue Date": i.issue_date ? new Date(i.issue_date).toLocaleDateString() : "N/A",
        "Due Date": i.due_date ? new Date(i.due_date).toLocaleDateString() : "N/A"
      }));

      const humanExpenses = scopedExpenses.map(e => ({
        "Expense Description": e.description, "Category": e.category,
        "Project Allocated": projects.find(p => p.id === e.project_id)?.name || "General Overhead",
        "Amount (₹)": e.amount, "Recorded Date": e.expense_date ? new Date(e.expense_date).toLocaleDateString() : "N/A"
      }));

      const humanPayments = scopedPayments.map(p => ({
        "Employee Paid": employees.find(e => e.id === p.employee_id)?.name || "Unknown",
        "Payment Category": p.payment_type,
        "Project Allocated": projects.find(proj => proj.id === p.project_id)?.name || "General Advance",
        "Amount (₹)": p.amount,
        "Transfer Date": p.payment_date ? new Date(p.payment_date).toLocaleDateString() : "N/A",
        "Notes / Ref": p.notes || "N/A"
      }));

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Zac Holdings ERP';
      workbook.created = new Date();

      applyPremiumStyle(workbook.addWorksheet('Projects'), humanProjects, 'Projects Master');
      applyPremiumStyle(workbook.addWorksheet('Personnel'), humanEmployees, 'Personnel Master');
      applyPremiumStyle(workbook.addWorksheet('Customers'), humanCustomers, 'Customer Registry');
      applyPremiumStyle(workbook.addWorksheet('Invoices'), humanInvoices, 'Invoice Log');
      applyPremiumStyle(workbook.addWorksheet('Expenses'), humanExpenses, 'Expense Log');
      applyPremiumStyle(workbook.addWorksheet('Salary Payouts'), humanPayments, 'Salary Disbursements');

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const dateString = new Date().toISOString().split('T')[0];
      const filename = backupTarget !== "all" 
        ? `${companies.find(c => c.id.toString() === backupTarget)?.name.replace(/\s+/g, '_')}_Backup_${dateString}.xlsx`
        : `Global_Master_Backup_${dateString}.xlsx`;

      saveAs(blob, filename);

      if (backupTarget !== "all") {
        await supabase.from('companies').update({ last_backup_date: new Date().toISOString() }).eq('id', parseInt(backupTarget));
        await fetchAllData();
      }

      setSaveStatus("idle");
    } catch (err) {
      alert("Failed to generate Excel backup.");
      setSaveStatus("idle");
    }
  };

  const handleUpdateInterval = async (days: number) => {
    if (backupTarget === "all") return;
    try {
      await supabase.from('companies').update({ backup_interval_days: days }).eq('id', parseInt(backupTarget));
      await fetchAllData();
    } catch (error) {
      alert("Failed to update reminder interval.");
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 sm:space-y-8 animate-in fade-in duration-700 pb-8 relative z-0">
      
      <div className="absolute inset-0 pointer-events-none z-[-1] overflow-hidden print:hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4wOCkiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,white,transparent)]" />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 sm:gap-6">
        <div>
          <p className="text-[9px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-1.5 sm:mb-2 bg-blue-50 inline-block px-2.5 sm:px-3 py-1 rounded-full">User Profile</p>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-1 sm:mt-2">Settings.</h1>
        </div>
      </div>

      <motion.div layout className="bg-white rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 shadow-sm flex flex-col lg:flex-row relative">
        
        <motion.div layout="position" className="lg:w-80 lg:rounded-l-[2rem] bg-gradient-to-b from-blue-50/50 to-slate-50/50 border-b lg:border-b-0 lg:border-r border-slate-100 p-5 sm:p-8 flex flex-col items-center text-center shrink-0">
          <div className="relative mb-3 sm:mb-6 mt-4">
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} className="hidden" />
            <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-full bg-white border-[3px] border-white shadow-md flex items-center justify-center text-slate-300 overflow-hidden relative ring-4 ring-blue-50">
              {imagePreview ? <img src={imagePreview} alt="Profile" className="h-full w-full object-cover" /> : <User className="h-10 w-10 sm:h-14 sm:w-14 opacity-50" />}
            </div>
            <button onClick={() => setShowPhotoMenu(!showPhotoMenu)} className="absolute bottom-0 right-0 h-8 w-8 sm:h-10 sm:w-10 bg-blue-600 border-2 border-white rounded-full flex items-center justify-center text-white hover:bg-blue-700 shadow-md transition-all active:scale-95 z-10">
              <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
            <AnimatePresence>
              {showPhotoMenu && (
                <>
                  <div className="fixed inset-0 z-[10]" onClick={() => setShowPhotoMenu(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 5, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.95 }} transition={{ duration: 0.15 }} className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-44 sm:w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[20] py-1">
                    <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-2 px-4 py-2.5 sm:py-3 text-[12px] sm:text-sm font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"><ImagePlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Upload Photo</button>
                    {imagePreview && <button onClick={handleRemovePhoto} className="w-full flex items-center gap-2 px-4 py-2.5 sm:py-3 text-[12px] sm:text-sm font-bold text-rose-600 hover:bg-rose-50 transition-colors border-t border-slate-50"><Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Remove Photo</button>}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <h3 className="font-bold text-slate-900 text-[15px] sm:text-[18px] truncate w-full">{currentEmployee?.name || 'Unnamed User'}</h3>
          <p className="text-[11px] sm:text-[13px] font-medium text-slate-500 mt-0.5 truncate w-full">{user?.email}</p>
          <div className="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-slate-200/60 w-full flex justify-center">
            <span className="inline-flex items-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[11px] font-bold uppercase tracking-widest bg-white text-blue-700 border border-blue-100 shadow-sm"><Shield className="h-3 w-3 sm:h-4 sm:w-4 mr-2" /> {role === 'head' ? 'Company Head' : role}</span>
          </div>
        </motion.div>

        <motion.div layout="position" className="flex-1 flex flex-col min-h-0">
          <div className="p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-start">
            
            <div className="space-y-6 lg:space-y-10">
              <div className="space-y-4">
                <h3 className="text-[12px] sm:text-[14px] font-bold text-slate-900 border-b border-slate-100 pb-2">Personal Information</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Full Name</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full h-11 sm:h-12 rounded-xl border border-slate-200 bg-slate-50/50 px-3 sm:px-4 text-[12px] sm:text-sm font-bold outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Email Address</label>
                    <input type="email" value={user?.email || ""} disabled className="w-full h-11 sm:h-12 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 px-3 sm:px-4 text-[12px] sm:text-sm font-medium outline-none cursor-not-allowed shadow-sm" />
                    <p className="text-[9px] sm:text-[10px] text-slate-400 ml-1 mt-1 font-medium">Contact system admin to modify login credentials.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-[12px] sm:text-[14px] font-bold text-slate-900 border-b border-slate-100 pb-2">Account Security</h3>
                <div className="space-y-1.5">
                  <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Change Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400" />
                    <input type={showPassword ? "text" : "password"} value={formData.newPassword} onChange={(e) => setFormData({...formData, newPassword: e.target.value})} placeholder="Enter new password..." className="w-full h-11 sm:h-12 rounded-xl border border-slate-200 bg-slate-50/50 pl-9 sm:pl-10 pr-10 sm:pr-12 text-[12px] sm:text-sm font-medium outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm [&::-ms-reveal]:hidden [&::-ms-clear]:hidden" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors">{showPassword ? <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}</button>
                  </div>
                  <AnimatePresence>
                    {formData.newPassword.length > 0 && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 sm:p-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className={`flex items-center gap-2 text-[10px] sm:text-[11px] font-bold transition-colors ${reqLength ? 'text-emerald-600' : 'text-slate-400'}`}>{reqLength ? <Check className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5 opacity-50" />} At least 6 chars</div>
                          <div className={`flex items-center gap-2 text-[10px] sm:text-[11px] font-bold transition-colors ${reqUpper ? 'text-emerald-600' : 'text-slate-400'}`}>{reqUpper ? <Check className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5 opacity-50" />} One uppercase</div>
                          <div className={`flex items-center gap-2 text-[10px] sm:text-[11px] font-bold transition-colors ${reqNumber ? 'text-emerald-600' : 'text-slate-400'}`}>{reqNumber ? <Check className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5 opacity-50" />} One number</div>
                          <div className={`flex items-center gap-2 text-[10px] sm:text-[11px] font-bold transition-colors ${reqSpecial ? 'text-emerald-600' : 'text-slate-400'}`}>{reqSpecial ? <Check className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5 opacity-50" />} One special char</div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {(role === 'admin' || role === 'head') && (
              <div className="space-y-4">
                <h3 className="text-[12px] sm:text-[14px] font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2"><HardDrive className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" /> Secure Data Backups</h3>
                <div className="bg-white border border-blue-100 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 sm:space-y-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-2xl"></div>
                  <p className="text-[11px] sm:text-[12px] font-medium text-slate-600">Export active workspace data into a formatted Excel file. Leave dates blank to export "All Time" history.</p>

                  <div className="grid grid-cols-1 gap-3 sm:gap-4">
                    {isGlobalAdmin && (
                      <div>
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Target Subsidiary</label>
                        <select value={backupTarget} onChange={(e) => setBackupTarget(e.target.value)} className="w-full h-10 sm:h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 sm:px-4 text-[11px] sm:text-xs font-bold text-slate-700 outline-none cursor-pointer focus:border-blue-500 shadow-sm appearance-none" style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}>
                          <option value="all">Global Master Data (All Workspaces)</option>
                          {companies.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      
                      <div className="flex flex-col">
                        <div className="h-[20px] flex items-end mb-1.5 ml-1">
                          <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Start Date</label>
                        </div>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <input type="date" value={backupStartDate} onChange={e => setBackupStartDate(e.target.value)} className="w-full h-10 sm:h-11 rounded-xl border border-slate-200 bg-white pl-9 sm:pl-10 pr-2 text-[10px] sm:text-xs font-medium outline-none focus:border-blue-500 shadow-sm" />
                        </div>
                      </div>

                      <div className="flex flex-col relative">
                        <div className="h-[20px] flex justify-between items-end mb-1.5 ml-1">
                          <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">End Date</label>
                          {(backupStartDate || backupEndDate) && (
                            <button type="button" onClick={() => { setBackupStartDate(""); setBackupEndDate(""); }} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-[10px] font-bold transition-colors">
                              <RefreshCcw className="h-2.5 w-2.5" /> Clear to All Time
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <input type="date" value={backupEndDate} onChange={e => setBackupEndDate(e.target.value)} className="w-full h-10 sm:h-11 rounded-xl border border-slate-200 bg-white pl-9 sm:pl-10 pr-2 text-[10px] sm:text-xs font-medium outline-none focus:border-blue-500 shadow-sm" />
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-2 sm:pt-3 border-t border-slate-100 flex items-center justify-between mt-2">
                      <div>
                        <p className="text-[10px] sm:text-[11px] font-bold text-slate-800">Auto-Reminder</p>
                        <p className="text-[9px] text-slate-400 font-medium">{backupTarget === "all" ? "Subsidiary selection required" : "Prompt admins to backup"}</p>
                      </div>
                      <select 
                        value={backupTarget === "all" ? 0 : (companies.find(c => c.id.toString() === backupTarget)?.backup_interval_days || 7)} 
                        onChange={(e) => handleUpdateInterval(parseInt(e.target.value))} 
                        disabled={backupTarget === "all"}
                        className={`w-28 sm:w-32 h-9 rounded-lg border border-slate-200 px-2 text-[10px] sm:text-[11px] font-bold text-slate-700 outline-none shadow-sm appearance-none ${backupTarget === 'all' ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'bg-white cursor-pointer hover:border-blue-300 transition-colors'}`} 
                        style={{ backgroundImage: backupTarget === 'all' ? 'none' : `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '12px' }}
                      >
                        <option value={0}>{backupTarget === "all" ? "N/A" : "Never"}</option>
                        {backupTarget !== "all" && (
                          <>
                            <option value={1}>Daily</option>
                            <option value={7}>Weekly</option>
                            <option value={14}>Bi-Weekly</option>
                            <option value={30}>Monthly</option>
                          </>
                        )}
                      </select>
                    </div>

                  </div>

                  <button type="button" onClick={handleDownloadBackup} disabled={saveStatus !== "idle"} className="w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 px-5 py-3 rounded-xl text-[11px] sm:text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 mt-2">
                    {saveStatus !== "idle" ? <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" /> : <Download className="h-4 w-4 sm:h-5 sm:w-5" />}
                    {backupStartDate || backupEndDate ? 'Download Selected Dates' : 'Download All Time History'}
                  </button>
                </div>
              </div>
            )}

          </div>

          <AnimatePresence>
            {hasUnsavedChanges && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="bg-[#FAFCFF] border-t border-slate-100 max-sm:rounded-b-[1.5rem] lg:rounded-br-[2rem] lg:rounded-bl-none overflow-hidden shrink-0 mt-auto">
                <div className="p-4 sm:p-6 flex justify-end">
                  <button onClick={handleSaveSettings} disabled={saveStatus !== "idle" || !isPasswordValid} className="relative overflow-hidden w-full sm:w-auto bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl h-11 sm:h-12 px-8 sm:px-10 text-[13px] sm:text-sm font-bold shadow-lg shadow-blue-900/30 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center group">
                    {saveStatus === "idle" && isPasswordValid && <motion.div animate={{ left: ['-100%', '200%'] }} transition={{ repeat: Infinity, duration: 2.5, ease: "linear", repeatDelay: 1.5 }} className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 z-0 pointer-events-none" />}
                    <span className="relative z-10 flex items-center">
                      {saveStatus === "compressing" && <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Compressing...</>}
                      {saveStatus === "uploading" && <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>}
                      {saveStatus === "saving" && <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>}
                      {saveStatus === "idle" && <>Save Changes <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-1.5 sm:ml-2" /></>}
                    </span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <AnimatePresence>
            {isSuccess && !hasUnsavedChanges && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-auto">
                <div className="p-4 sm:p-6 flex justify-center">
                  <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-[10px] sm:text-[11px] uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-lg shadow-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Update Successful
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>
      </motion.div>
    </div>
  );
}