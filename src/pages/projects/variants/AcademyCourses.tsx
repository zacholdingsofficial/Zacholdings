import { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, BookOpen, X, Check, User, Trash2, Loader2, GraduationCap, Users, Library, CheckCircle2, ChevronDown, ExternalLink, UploadCloud, Calendar, Info, Layers, FileText, Eye, ThumbsUp, ThumbsDown, MessageCircle, Edit2, CornerDownRight, Lock, Building2 } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import { useDataStore } from "../../../store/dataStore";
import { supabase } from "../../../supabase";

const ACADEMY_STATUSES = ['Enrollment', 'Ongoing', 'Graduated', 'Postponed', 'On Hold'];
const ACADEMY_TYPES = ['Course', 'Workshop', 'Internship'];

export default function AcademyCourses({ autoOpenProjectId, forcedCompanyId, onClearOverride, onCrossHandoff }: { autoOpenProjectId?: number | null, forcedCompanyId?: number | null, onClearOverride?: () => void, onCrossHandoff?: (projectId: number, compId: number) => void }) {
  const { role, employeeId, activeWorkspace, companyId } = useAuthStore();
  const store = useDataStore() || {};
  
  const projects = store.projects || [];
  const tasks = store.tasks || [];
  const employees = store.employees || [];
  const customers = store.customers || [];
  const invoices = store.invoices || [];
  const salaryPayments = store.salaryPayments || [];
  const projectAllocations = store.projectAllocations || [];
  const reports = store.reports || [];
  const companies = store.companies || [];
  const fetchAllData = store.fetchAllData || (async () => {});

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("All"); 

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<string>("details");
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const isUserView = role === 'user';
  const isImpersonating = role === 'admin' && activeWorkspace !== null;
  const isGlobalAdmin = role === 'admin' && !isImpersonating;
  const isAdminView = isGlobalAdmin || role === 'head' || isImpersonating;
  const isHeadView = role === 'head' || isImpersonating; 

  const [formData, setFormData] = useState({ 
    name: "", description: "", status: "Enrollment", type: "Course", expected_amount: 0, 
    approval_date: today, due_date: "", company_id: "", customer_id: "", drive_folder_url: "", assignee_ids: [] as number[],
    tutor_allocations: {} as {[empId: number]: string}
  });
  
  const [newStudent, setNewStudent] = useState({ name: "", phone: "", email: "", address: "" });
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newModuleTutor, setNewModuleTutor] = useState<number | "">("");

  const [classReportText, setClassReportText] = useState("");
  const [needsUpload, setNeedsUpload] = useState<boolean | null>(null);
  const [confirmedUpload, setConfirmedUpload] = useState(false);
  const [showDriveHelpModal, setShowDriveHelpModal] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryText, setEditingEntryText] = useState("");

  const [timelineModalEmpId, setTimelineModalEmpId] = useState<number | null>(null);
  const [reactionFormId, setReactionFormId] = useState<string | null>(null);
  const [reactionText, setReactionText] = useState("");

  const [allocationsForm, setAllocationsForm] = useState<{[empId: number]: {allocated: number, incentive: number}}>({});
  const [expandedFinanceEmpId, setExpandedFinanceEmpId] = useState<number | null>(null);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ employee_id: "", amount: 0, payment_type: "Final Payout", notes: "" });
  const [isPrintingPayslip, setIsPrintingPayslip] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [showLogoMenu, setShowLogoMenu] = useState(false);

  // Use forcedCompanyId if router provides it, otherwise fallback
  const currentCompanyId = forcedCompanyId ? forcedCompanyId.toString() : (isGlobalAdmin ? "" : (activeWorkspace || companyId));
  const currentCompany = companies.find((c: any) => c.id?.toString() === currentCompanyId?.toString());
  const showFinance = role === 'admin' || (role === 'head' && currentCompany?.allow_head_finance !== false);

  const visibleCourses = projects.filter(p => {
    if (!p.name) return false;
    
    const pType = p.metadata?.type || 'Course';
    if (!ACADEMY_TYPES.includes(pType)) return false;

    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "All" || p.status === filterStatus;
    const matchesType = filterType === "All" || pType === filterType;

    if (isGlobalAdmin) {
       return matchesSearch && matchesStatus && matchesType && (forcedCompanyId ? p.company_id?.toString() === forcedCompanyId.toString() : true);
    }

    const isAssigned = !isUserView || (p.assignee_ids || []).includes(employeeId);
    return matchesSearch && matchesStatus && matchesType && isAssigned && p.company_id?.toString() === currentCompanyId?.toString();
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const availableStudents = customers.filter(c => c.company_id === parseInt(currentCompanyId || '0'));
  
  const availableTutors = employees.filter(emp => {
    const assignments = emp.company_roles && emp.company_roles.length > 0 
      ? emp.company_roles 
      : [{ company_id: emp.company_id, access_level: emp.access_level }];
      
    const hasGlobalAdmin = assignments.some((cr: any) => cr.access_level === 'admin');
    if (hasGlobalAdmin) return false;

    return assignments.some((cr: any) => cr.company_id?.toString() === formData.company_id?.toString());
  });

  // MODIFIED: useLayoutEffect guarantees the modal opens BEFORE the browser paints the empty screen
  useLayoutEffect(() => {
    if (autoOpenProjectId && projects.length > 0) {
      const projToOpen = projects.find((p: any) => p.id === autoOpenProjectId);
      if (projToOpen) {
        openCourseDetails(projToOpen);
      }
    }
  }, [autoOpenProjectId, projects]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    if (onClearOverride) onClearOverride();
  };

  const openNewCourse = () => {
    setSelectedCourse(null);
    setFormData({ name: "", description: "", status: "Enrollment", type: "Course", expected_amount: 0, approval_date: today, due_date: "", company_id: currentCompanyId?.toString() || "", customer_id: "", drive_folder_url: "", assignee_ids: [], tutor_allocations: {} });
    setNewStudent({ name: "", phone: "", email: "", address: "" }); setSelectedStudentId("");
    setNewModuleTitle(""); setNewModuleTutor("");
    setAllocationsForm({}); setExpandedFinanceEmpId(null); setShowPayoutForm(false); setShowDescription(false);
    setNeedsUpload(null); setConfirmedUpload(false);
    setModalTab("details"); setIsModalOpen(true);
  };

  const openCourseDetails = (course: any) => {
    setSelectedCourse(course);
    setFormData({
      name: course.name || "", description: course.description || "", status: course.status || "Enrollment", 
      type: course.metadata?.type || "Course",
      expected_amount: course.expected_amount || 0, approval_date: course.approval_date || today, due_date: course.due_date || "", 
      company_id: course.company_id?.toString() || "", customer_id: course.customer_id?.toString() || "", 
      drive_folder_url: course.drive_folder_url || "", assignee_ids: course.assignee_ids || [],
      tutor_allocations: course.metadata?.tutor_allocations || {}
    });
    setExpandedFinanceEmpId(null); setShowPayoutForm(false); setClassReportText(""); setTimelineModalEmpId(null); 
    setShowDescription(!!course.description);
    setNeedsUpload(null); setConfirmedUpload(false);

    const currentAlloc: any = {};
    course.assignee_ids?.forEach((id: number) => {
      const a = projectAllocations.find(pa => pa.project_id === course.id && pa.employee_id === id);
      currentAlloc[id] = { allocated: a?.allocated_amount || 0, incentive: a?.incentive_amount || 0 };
    });
    setAllocationsForm(currentAlloc);

    setModalTab("details"); setIsModalOpen(true);
  };

  const handleSaveCourse = async () => {
    if (!formData.name.trim()) return alert("Batch name is required.");
    setIsSaving(true);
    try {
      const payload = { 
        name: formData.name,
        description: formData.description || null,
        status: formData.status,
        expected_amount: formData.expected_amount || 0,
        approval_date: formData.approval_date || null,
        due_date: formData.due_date || null,
        company_id: formData.company_id ? parseInt(formData.company_id) : parseInt(currentCompanyId || '0'),
        customer_id: formData.customer_id ? parseInt(formData.customer_id) : null,
        drive_folder_url: formData.drive_folder_url || null,
        assignee_ids: formData.assignee_ids || [],
        metadata: { tutor_allocations: formData.tutor_allocations, type: formData.type }
      };
      
      if (!selectedCourse) {
        const { error } = await supabase.from('projects').insert([payload]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('projects').update(payload).eq('id', selectedCourse.id);
        if (error) throw error;
      }
      
      await fetchAllData(); handleCloseModal();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleEnrollStudent = async () => {
    if (!selectedCourse) return;
    setIsSaving(true);
    try {
      let studentId = selectedStudentId;
      
      if (!studentId) {
        if (!newStudent.name.trim()) throw new Error("Student Name is required.");
        const { data, error } = await supabase.from('customers').insert([{ 
          company_id: parseInt(currentCompanyId || '0'), 
          name: newStudent.name, 
          phone: newStudent.phone,
          email: newStudent.email || null,
          address: newStudent.address || null
        }]).select().single();
        if (error) throw error;
        studentId = data.id;
      }

      if (!studentId) throw new Error("Please select an existing student or fill out the new student details.");

      const invPayload = {
        company_id: parseInt(currentCompanyId || '0'),
        customer_id: parseInt(studentId),
        project_id: selectedCourse.id,
        invoice_number: `INV-EDU-${Math.floor(1000 + Math.random() * 9000)}`,
        issue_date: today,
        due_date: formData.due_date || today,
        subtotal: selectedCourse.expected_amount || 0,
        total_amount: selectedCourse.expected_amount || 0,
        status: 'Pending'
      };

      const { data: invData, error: invError } = await supabase.from('invoices').insert([invPayload]).select().single();
      if (invError) throw invError;

      if (invData) {
        await supabase.from('invoice_items').insert([{
          invoice_id: invData.id,
          description: `Enrollment Fee: ${selectedCourse.name}`,
          quantity: 1,
          rate: selectedCourse.expected_amount || 0,
          total: selectedCourse.expected_amount || 0
        }]);
      }

      alert("Student enrolled and joining invoice generated successfully.");
      setNewStudent({ name: "", phone: "", email: "", address: "" });
      setSelectedStudentId("");
      await fetchAllData();
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleSaveAllocations = async () => {
    if (!selectedCourse) return;
    setIsSaving(true);
    try {
      for (const empId of Object.keys(allocationsForm)) {
        const alloc = allocationsForm[parseInt(empId)];
        await supabase.from('project_allocations').upsert({ project_id: selectedCourse.id, employee_id: parseInt(empId), allocated_amount: alloc.allocated, incentive_amount: alloc.incentive }, { onConflict: 'project_id, employee_id' });
      }
      alert("Faculty salary allocations saved successfully.");
      await fetchAllData();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleRecordFacultyPayment = async () => {
    if (!paymentForm.employee_id || paymentForm.amount <= 0) return alert("Select a faculty member and enter an amount.");
    setIsSaving(true);
    try {
      const { error } = await supabase.from('salary_payments').insert([{
        employee_id: parseInt(paymentForm.employee_id), company_id: parseInt(currentCompanyId || '0'), project_id: selectedCourse.id,
        amount: paymentForm.amount, payment_type: paymentForm.payment_type, payment_date: today, payment_month: today.substring(0, 7), notes: paymentForm.notes
      }]);
      if (error) throw error;

      setPaymentForm({ employee_id: "", amount: 0, payment_type: "Final Payout", notes: "" });
      setExpandedFinanceEmpId(parseInt(paymentForm.employee_id)); 
      setShowPayoutForm(false); 
      await fetchAllData();
      alert("Payout successfully transferred and logged.");
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleDeleteFacultyPayment = async (paymentId: number) => {
    if (!window.confirm("Remove this payout record?")) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('salary_payments').delete().eq('id', paymentId);
      if (error) throw error;
      await fetchAllData();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleSaveClassReport = async () => {
    if (!selectedCourse || !classReportText.trim()) return;
    if (needsUpload === true && !confirmedUpload) return alert("Please confirm you have uploaded the required files to the Drive workspace.");
    
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id === selectedCourse.id && r.employee_id === employeeId);
      const newEntry = {
        id: crypto.randomUUID(),
        type: needsUpload ? 'upload' : 'note',
        text: classReportText.trim(),
        timestamp: new Date().toISOString()
      };
      const currentEntries = existingReport?.entries || [];
      
      await supabase.from('project_reports').upsert({ 
        project_id: selectedCourse.id, 
        employee_id: employeeId, 
        entries: [...currentEntries, newEntry] 
      }, { onConflict: 'project_id, employee_id' });
      
      setClassReportText(""); 
      setNeedsUpload(null);
      setConfirmedUpload(false);
      await fetchAllData();
      alert("Class report submitted successfully.");
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleEditUserEntry = async (entryId: string) => {
    if (!selectedCourse || !editingEntryText.trim()) return;
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id === selectedCourse.id && r.employee_id === employeeId);
      if (!existingReport) return;

      const updatedEntries = (existingReport.entries || []).map((e: any) => 
        e.id === entryId ? { ...e, text: editingEntryText.trim() } : e
      );

      await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
      setEditingEntryId(null); setEditingEntryText("");
      await fetchAllData();
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleDeleteEntry = async (empId: number, entryId: string) => {
    if (!window.confirm("Delete this log entry?")) return;
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id === selectedCourse.id && r.employee_id === empId);
      if (!existingReport) return;
      
      const updatedEntries = (existingReport.entries || []).filter((e: any) => e.id !== entryId);
      await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
      await fetchAllData();
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleAdminReact = async (empId: number, entryId: string, status: string, customText: string = "") => {
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id === selectedCourse.id && r.employee_id === empId);
      if (!existingReport) return;

      const updatedEntries = (existingReport.entries || []).map((e: any) => {
        if (e.id === entryId) {
          return {
            ...e,
            reaction: { status, text: customText.trim(), timestamp: new Date().toISOString() }
          };
        }
        return e;
      });

      await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
      setReactionFormId(null); setReactionText("");
      await fetchAllData();
    } catch (e: any) { alert("Failed to add reaction: " + e.message); } finally { setIsSaving(false); }
  };

  const handleDeleteReaction = async (empId: number, entryId: string) => {
    if (!window.confirm("Remove this feedback?")) return;
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id === selectedCourse.id && r.employee_id === empId);
      if (!existingReport) return;

      const updatedEntries = (existingReport.entries || []).map((e: any) => {
        if (e.id === entryId) {
          const { reaction, ...rest } = e; 
          return rest;
        }
        return e;
      });

      await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
      await fetchAllData();
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleDeleteCourse = async () => {
    if (!window.confirm(`Delete "${selectedCourse.name}"?`)) return;
    setIsSaving(true);
    await supabase.from('projects').delete().eq('id', selectedCourse.id);
    await fetchAllData(); handleCloseModal(); setIsSaving(false);
  };

  const handleAddModule = async () => {
    if (!newModuleTitle.trim() || !newModuleTutor || !selectedCourse) return;
    await supabase.from('project_tasks').insert([{ project_id: selectedCourse.id, title: newModuleTitle, assignee_id: newModuleTutor, deadline: null }]);
    await fetchAllData();
    setNewModuleTitle(""); setNewModuleTutor("");
  };

  const handleToggleModule = async (module: any) => {
    if (isUserView) return;
    await supabase.from('project_tasks').update({ is_completed: !module.is_completed }).eq('id', module.id);
    await fetchAllData();
  };

  const handlePrintPayslip = () => {
    setIsPrintingPayslip(true);
    setTimeout(() => { 
      window.print(); 
      setTimeout(() => setIsPrintingPayslip(false), 500); 
    }, 500);
  };

  const getReactionVisuals = (status: string) => {
    switch(status) {
      case 'Approved': return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: ThumbsUp };
      case 'Rejected': return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: ThumbsDown };
      case 'Reviewed': return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Eye };
      default: return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: MessageCircle };
    }
  };

  const getAvatar = (id: number) => employees.find(e => e.id === id);
  const displayModules = selectedCourse ? tasks.filter(t => t.project_id === selectedCourse.id).sort((a, b) => a.id - b.id) : [];

  const courseInvoices = selectedCourse ? invoices.filter(i => i.project_id === selectedCourse.id) : [];
  const totalInvoiced = courseInvoices.reduce((sum, i) => sum + (parseFloat(i.total_amount) || 0), 0);
  const totalPaid = courseInvoices.reduce((sum, i) => {
    const paid = parseFloat(i.amount_paid) || (i.status === 'Paid' ? parseFloat(i.total_amount) : 0);
    return sum + paid;
  }, 0);
  const totalDue = totalInvoiced - totalPaid;

  const facultyAllocation = selectedCourse ? projectAllocations.find(pa => pa.project_id === selectedCourse.id && pa.employee_id === employeeId) : null;
  const facultyPayments = selectedCourse ? salaryPayments.filter(sp => sp.project_id === selectedCourse.id && sp.employee_id === employeeId) : [];
  const facultyTotalEarned = facultyPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const facultyTotalAllocated = (facultyAllocation?.allocated_amount || 0) + (facultyAllocation?.incentive_amount || 0);
  const facultyBalanceDue = Math.max(0, facultyTotalAllocated - facultyTotalEarned);

  const hasAllocationChanges = selectedCourse && (formData.assignee_ids || []).some(empId => {
    const formAlloc = allocationsForm[empId] || { allocated: 0, incentive: 0 };
    const originalAlloc = projectAllocations.find(pa => pa.project_id === selectedCourse.id && pa.employee_id === empId);
    return Number(formAlloc.allocated) !== Number(originalAlloc?.allocated_amount || 0) || Number(formAlloc.incentive) !== Number(originalAlloc?.incentive_amount || 0);
  });

  return (
    <>
      <div className="max-w-[1200px] mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-700 pb-8 relative z-0 print:hidden">
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
          <div>
            <p className="text-[9px] sm:text-[11px] font-bold text-purple-600 uppercase tracking-[0.2em] mb-1.5 sm:mb-2 bg-purple-50 inline-block px-3 py-1 rounded-full">Academy Operations</p>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-1 sm:mt-2">Courses & Batches.</h1>
          </div>
          {isAdminView && (
            <button onClick={openNewCourse} className="bg-gradient-to-r from-purple-900 to-indigo-800 text-white shadow-lg shadow-purple-900/20 hover:shadow-xl hover:-translate-y-0.5 px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-[13px] font-bold transition-all flex items-center shrink-0">
              <Plus className="h-4 w-4 mr-1.5 sm:mr-2" /> New Batch
            </button>
          )}
        </div>

        {/* --- TYPE FILTER TABS --- */}
        <div className="flex gap-2 overflow-x-auto pb-1 max-sm:[&::-webkit-scrollbar]:hidden">
          {['All', ...ACADEMY_TYPES].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                filterType === type 
                  ? 'bg-purple-900 text-white shadow-md' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {type === 'All' ? 'All Programs' : `${type}s`}
            </button>
          ))}
        </div>

        <div className="bg-white p-2 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-2 print:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 w-3.5 sm:w-4 text-slate-400" />
            <input type="text" placeholder="Search batches or courses..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-10 sm:h-11 pl-9 sm:pl-11 pr-4 rounded-lg sm:rounded-xl border-none text-[13px] sm:text-sm font-medium outline-none bg-transparent focus:ring-0 placeholder:text-slate-400" />
          </div>
          
          <div className="sm:w-48 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-2">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full h-10 sm:h-11 rounded-lg sm:rounded-xl bg-purple-50 border-none px-3 sm:px-4 text-[12px] sm:text-sm font-bold text-purple-900 outline-none cursor-pointer appearance-none">
               <option value="All">All Statuses</option>
               {ACADEMY_STATUSES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-4 print:hidden">
          {visibleCourses.length === 0 ? (
             <div className="h-48 sm:h-64 border border-purple-100 border-dashed rounded-2xl sm:rounded-3xl flex flex-col items-center justify-center text-purple-300 bg-purple-50/30">
                <BookOpen className="h-8 w-8 sm:h-10 sm:w-10 mb-2 sm:mb-3" />
                <p className="text-[11px] sm:text-sm font-bold uppercase tracking-wider text-purple-400">No Batches Found</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
              {visibleCourses.map(course => {
                const courseModules = tasks.filter(t => t.project_id === course.id);
                const completedModules = courseModules.filter(t => t.is_completed).length;
                const totalModules = courseModules.length;
                const progressPct = totalModules === 0 ? 0 : Math.round((completedModules / totalModules) * 100);
                const enrolledCount = invoices.filter(i => i.project_id === course.id).length;
                
                const pType = course.metadata?.type || 'Course';

                return (
                  <div key={course.id} onClick={() => openCourseDetails(course)} className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-purple-200 transition-all flex flex-col overflow-hidden cursor-pointer group">
                    <div className="p-5 sm:p-7 flex flex-col gap-5">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0 flex items-start gap-4">
                          <div className="h-12 w-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100 group-hover:scale-105 transition-transform"><Library className="h-5 w-5" /></div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-md">{pType}</span>
                            </div>
                            <h3 className="text-[15px] sm:text-lg font-bold text-slate-900 tracking-tight group-hover:text-purple-900 transition-colors truncate">{course.name}</h3>
                            <p className="text-[10px] sm:text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-1 truncate flex items-center gap-2">
                              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {enrolledCount} Students</span>
                              {isHeadView && <><span>•</span><span>Fee: ₹{(course.expected_amount || 0).toLocaleString()}</span></>}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0">
                          <div className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border 
                            ${course.status === 'Graduated' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                              course.status === 'On Hold' || course.status === 'Postponed' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-purple-50 text-purple-700 border-purple-200'}`}>
                             {course.status}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                        <div className="flex items-center gap-4">
                           <div className="w-32 sm:w-48 bg-slate-100 h-2 rounded-full overflow-hidden">
                             <div className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-1000" style={{ width: `${progressPct}%` }} />
                           </div>
                           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{progressPct}% Syllabus</span>
                        </div>
                        <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-lg border border-purple-100">View Details →</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* --- INVOICE-STYLED PRINTABLE FACULTY PAYSLIP PORTAL --- */}
      {isPrintingPayslip && selectedCourse && isUserView && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] bg-white print:block print:relative print:w-full print:h-auto overflow-visible p-12 font-sans text-slate-900 print:p-0 print:m-0" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
          
          <div className="flex justify-between items-start pb-8 border-b-2 border-slate-900 mb-8 mt-4">
             <div className="flex items-center gap-4">
                <div className="h-16 flex items-center justify-center">
                   {currentCompany?.logo_url ? <img src={currentCompany.logo_url} alt="" className="h-16 max-w-[140px] object-contain" /> : <Building2 className="h-10 w-10 text-purple-900" />}
                </div>
                <div>
                   <h2 className="text-2xl font-black tracking-tight text-slate-900">{currentCompany?.name || 'Academy Enterprise'}</h2>
                   <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">{currentCompany?.area || 'Educational Operations'}</p>
                </div>
             </div>
             <div className="text-right">
                <h1 className="text-3xl font-black text-purple-900 tracking-tight uppercase">PAYOUT REMITTANCE</h1>
                <p className="text-xs font-bold text-slate-500 mt-1 font-mono">BATCH: {selectedCourse.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">Date: {new Date().toLocaleDateString()}</p>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
             <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Prepared For (Faculty)</p>
                <p className="text-sm font-black text-slate-900">{getAvatar(employeeId)?.name}</p>
             </div>
             <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Assignment & Scope</p>
                <p className="text-sm font-bold text-slate-900">{selectedCourse.metadata?.tutor_allocations?.[employeeId] || 'Assigned Course Tutor'}</p>
                <p className="text-slate-600 font-medium mt-0.5">Duration: {selectedCourse.approval_date || 'Start'} to {selectedCourse.due_date || 'End'}</p>
             </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden mb-8">
             <div className="grid grid-cols-12 bg-slate-900 text-white px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider">
                <span className="col-span-8">Compensation Element</span>
                <span className="col-span-4 text-right">Amount</span>
             </div>
             <div className="grid grid-cols-12 px-6 py-4 border-b border-slate-100 text-xs items-center">
                <span className="col-span-8 font-bold text-slate-800">Base Salary Allocation</span>
                <span className="col-span-4 text-right font-black text-slate-900">₹{(facultyAllocation?.allocated_amount || 0).toLocaleString()}</span>
             </div>
             
             {(facultyAllocation?.incentive_amount || 0) > 0 && (
                <div className="grid grid-cols-12 px-6 py-4 border-b border-slate-100 text-xs items-center bg-purple-50/30">
                   <span className="col-span-8 font-bold text-purple-900">Performance Incentive / Bonus</span>
                   <span className="col-span-4 text-right font-black text-purple-700">+ ₹{(facultyAllocation?.incentive_amount || 0).toLocaleString()}</span>
                </div>
             )}

             <div className="grid grid-cols-12 px-6 py-5 bg-slate-50 text-sm items-center">
                <span className="col-span-8 font-black text-slate-900 uppercase tracking-wide">Total Earnings</span>
                <span className="col-span-4 text-right font-black text-purple-900 text-lg">₹{facultyTotalAllocated.toLocaleString()}</span>
             </div>
          </div>

          <div className="mb-8">
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Disbursed Payout History</h3>
             <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-3 bg-slate-50 px-6 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                   <span>Date</span>
                   <span>Type & Notes</span>
                   <span className="text-right">Amount</span>
                </div>
                {facultyPayments.length === 0 ? (
                   <p className="text-xs italic text-slate-400 p-4">No disbursements recorded yet.</p>
                ) : (
                   facultyPayments.map(p => (
                      <div key={p.id} className="grid grid-cols-3 px-6 py-3 border-b border-slate-100 text-xs items-center last:border-none">
                         <span className="font-bold text-slate-700">{new Date(p.payment_date).toLocaleDateString()}</span>
                         <span className="text-slate-600">{p.payment_type} {p.notes && `(${p.notes})`}</span>
                         <span className="text-right font-black text-emerald-600">₹{parseFloat(p.amount).toLocaleString()}</span>
                      </div>
                   ))
                )}
             </div>
          </div>

          {facultyBalanceDue > 0 && (
             <div className="flex justify-end pt-6 border-t-2 border-slate-200">
                <div className="w-64 bg-purple-900 text-white p-5 rounded-2xl text-right shadow-lg">
                   <p className="text-[10px] font-bold text-purple-200 uppercase tracking-widest mb-1">Remaining Balance Due</p>
                   <p className="text-2xl font-black text-white">₹{facultyBalanceDue.toLocaleString()}</p>
                </div>
             </div>
          )}
        </div>,
        document.body
      )}

      {/* MAIN MODAL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isModalOpen && !isPrintingPayslip && (
            <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
               onClick={handleCloseModal} 
               className="fixed inset-0 z-[9999] flex flex-col items-center justify-center max-sm:px-4 max-sm:pt-20 max-sm:pb-[110px] sm:p-4 bg-slate-900/40 backdrop-blur-sm print:hidden"
            >
              <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} onClick={(e) => e.stopPropagation()} className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-4xl h-full sm:h-[760px] sm:max-h-[90vh] flex flex-col overflow-hidden border border-slate-100 mt-auto sm:mt-0">
                
                <div className="px-5 sm:px-8 pt-5 sm:pt-7 border-b border-slate-100 bg-[#FAFCFF] shrink-0">
                  <div className="flex items-center justify-between mb-4 sm:mb-5">
                    <div className="pr-4 flex items-center gap-3">
                      <div className="h-10 w-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center shrink-0"><GraduationCap className="h-5 w-5" /></div>
                      <div>
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-purple-600">Batch Control Center</span>
                        <h3 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight leading-none mt-1 truncate">{selectedCourse ? selectedCourse.name : 'Create New Batch'}</h3>
                      </div>
                    </div>
                    <button onClick={handleCloseModal} className="h-8 w-8 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                  
                  <div className="flex gap-4 sm:gap-8 overflow-x-auto max-sm:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {!selectedCourse ? (
                      <>
                        <div className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'details' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400'}`}>Step 1: Batch Setup</div>
                        <div className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'details_faculty' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400'}`}>Step 2: Assign Faculty</div>
                        <div className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'syllabus' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400'}`}>Step 3: Syllabus</div>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setModalTab('details')} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'details' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>1. Batch Setup</button>
                        <button onClick={() => setModalTab('details_faculty')} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'details_faculty' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>2. Faculty</button>
                        <button onClick={() => setModalTab('syllabus')} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'syllabus' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>3. Syllabus</button>
                        <button onClick={() => setModalTab('summary')} disabled={!selectedCourse} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${!selectedCourse ? 'opacity-30 cursor-not-allowed' : modalTab === 'summary' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>4. Students</button>
                        
                        {isAdminView && <button onClick={() => setModalTab('finances')} disabled={!selectedCourse} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${!selectedCourse ? 'opacity-30 cursor-not-allowed' : modalTab === 'finances' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>5. Fee Ledger</button>}
                        {isAdminView && <button onClick={() => setModalTab('faculty')} disabled={!selectedCourse} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${!selectedCourse ? 'opacity-30 cursor-not-allowed' : modalTab === 'faculty' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>6. Payroll</button>}
                        {isUserView && <button onClick={() => setModalTab('reports')} disabled={!selectedCourse} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${!selectedCourse ? 'opacity-30 cursor-not-allowed' : modalTab === 'reports' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>5. Class Reports</button>}
                        {isUserView && <button onClick={() => setModalTab('my_payouts')} disabled={!selectedCourse} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${!selectedCourse ? 'opacity-30 cursor-not-allowed' : modalTab === 'my_payouts' ? 'border-purple-900 text-purple-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>6. My Payouts</button>}
                      </>
                    )}
                  </div>
                </div>

                {/* TAB 1: DETAILS */}
                {modalTab === 'details' && (
                  <div className="flex-1 overflow-y-auto p-5 sm:p-8 flex flex-col">
                    <div className="flex-1 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="md:col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">Batch / Course Name</label>
                          <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} disabled={isUserView} className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium outline-none focus:border-purple-500 shadow-sm disabled:bg-slate-50" />
                        </div>
                        {isAdminView && (
                          <div>
                            <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block mb-2 px-1">Fee Per Head (₹)</label>
                            <input type="number" value={formData.expected_amount} onChange={(e) => setFormData({...formData, expected_amount: parseFloat(e.target.value) || 0})} className="w-full h-12 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 outline-none shadow-sm" />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        <div>
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">Program Type</label>
                           <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} disabled={isUserView} className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm disabled:bg-slate-50">
                              {ACADEMY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                           </select>
                        </div>
                        <div>
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">Status</label>
                           <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} disabled={isUserView} className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm disabled:bg-slate-50">
                              {ACADEMY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                           </select>
                        </div>
                        <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">Starting Date</label><input type="date" value={formData.approval_date} onChange={(e) => setFormData({...formData, approval_date: e.target.value})} disabled={isUserView} className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm disabled:bg-slate-50" /></div>
                        <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">Ending Date</label><input type="date" value={formData.due_date} onChange={(e) => setFormData({...formData, due_date: e.target.value})} disabled={isUserView} className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm disabled:bg-slate-50" /></div>
                      </div>

                      {/* NEW: Batch Description Toggle */}
                      <div>
                        {!showDescription && !formData.description ? (
                          !isUserView && (
                            <button type="button" onClick={() => setShowDescription(true)} className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-purple-600 hover:text-purple-800 uppercase tracking-wider transition-colors px-1">
                              <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Add Batch Description
                            </button>
                          )
                        ) : (
                          <div className="animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between mb-1.5 sm:mb-2 px-1">
                              <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Batch Description</label>
                              {!isUserView && (
                                <button type="button" onClick={() => { setShowDescription(false); setFormData({...formData, description: ""}); }} className="text-slate-400 hover:text-rose-500 transition-colors" title="Remove Description">
                                  <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                </button>
                              )}
                            </div>
                            <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} disabled={isUserView} className="w-full h-20 sm:h-24 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 text-[12px] sm:text-sm font-medium outline-none focus:border-purple-500 shadow-sm resize-none disabled:bg-slate-50" placeholder="Briefly describe the batch goals or curriculum..." />
                          </div>
                        )}
                      </div>

                      {isAdminView && (
                        <div>
                          <label className="text-[10px] font-bold text-purple-600 uppercase tracking-widest block mb-2 px-1">Secure Google Drive Link (Class Materials & Notes)</label>
                          <input type="url" placeholder="https://drive.google.com/..." value={formData.drive_folder_url} onChange={(e) => setFormData({...formData, drive_folder_url: e.target.value})} className="w-full h-12 rounded-xl border border-purple-200 bg-purple-50/50 px-4 text-sm font-medium outline-none shadow-sm" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: FACULTY ASSIGNMENT WIZARD */}
                {modalTab === 'details_faculty' && (
                  <div className="flex-1 overflow-y-auto p-5 sm:p-8 flex flex-col">
                    <div className="pt-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 px-1">Assign Faculty / Tutors & Task Allocation</label>
                      <div className="space-y-2">
                        {availableTutors.length === 0 ? <p className="text-xs text-slate-400 italic">No available faculty members to assign.</p> : null}
                        {availableTutors.map(emp => {
                          const isSelected = formData.assignee_ids.includes(emp.id);
                          if (isUserView && !isSelected) return null;
                          return (
                            <div key={emp.id} className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-3 ${isSelected ? 'bg-purple-50/50 border-purple-200' : 'bg-white border-slate-200'}`}>
                              <button disabled={isUserView} onClick={() => { if (isSelected) setFormData({...formData, assignee_ids: formData.assignee_ids.filter(id => id !== emp.id)}); else setFormData({...formData, assignee_ids: [...formData.assignee_ids, emp.id]}); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold shrink-0 ${isSelected ? 'bg-purple-900 text-white border-transparent' : 'bg-slate-100 text-slate-700'}`}>
                                {emp.name}
                              </button>
                              {isSelected && isAdminView && (
                                <input 
                                  type="text" 
                                  placeholder="Task allocation (e.g., Mathematics & Calculus Module)..." 
                                  value={formData.tutor_allocations[emp.id] || ""} 
                                  onChange={e => setFormData({
                                    ...formData, 
                                    tutor_allocations: {...formData.tutor_allocations, [emp.id]: e.target.value}
                                  })} 
                                  className="flex-1 h-9 rounded-lg border border-purple-200 bg-white px-3 text-xs outline-none" 
                                />
                              )}
                              {isUserView && isSelected && (
                                <span className="text-xs font-semibold text-purple-900">Task: {formData.tutor_allocations[emp.id] || 'General Instruction'}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: SYLLABUS */}
                {modalTab === 'syllabus' && (
                  <div className="flex-1 overflow-y-auto p-5 sm:p-8 flex flex-col">
                    <div className="w-full flex flex-col h-full gap-6">
                      {isAdminView && (
                        <div className="flex flex-col sm:flex-row gap-3 shrink-0 p-5 bg-purple-50/50 rounded-2xl border border-purple-100">
                          <input type="text" placeholder="New Module / Topic Name..." value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newModuleTitle && newModuleTutor) handleAddModule(); }} className="flex-1 h-12 rounded-xl border border-white px-4 text-sm font-bold text-purple-900 outline-none bg-white shadow-sm placeholder:text-purple-300" />
                          <div className="flex gap-3">
                            <select value={newModuleTutor} onChange={(e) => setNewModuleTutor(parseInt(e.target.value) || "")} className="w-full sm:w-48 h-12 rounded-xl border border-white px-3 text-sm font-bold text-purple-900 outline-none bg-white shadow-sm cursor-pointer">
                              <option value="" disabled>-- Assign Tutor --</option>
                              {(formData.assignee_ids || []).map(id => <option key={id} value={id}>{getAvatar(id)?.name}</option>)}
                            </select>
                            <button onClick={handleAddModule} disabled={!newModuleTitle || !newModuleTutor} className="h-12 w-12 bg-purple-600 text-white rounded-xl flex items-center justify-center font-bold shadow-md hover:bg-purple-700 transition-colors disabled:opacity-50"><Plus className="h-5 w-5" /></button>
                          </div>
                        </div>
                      )}

                      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {displayModules.length === 0 ? (
                          <div className="h-40 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                            <BookOpen className="h-8 w-8 mb-2 text-slate-300" />
                            <p className="text-[11px] font-bold uppercase tracking-wider">Syllabus is empty</p>
                          </div>
                        ) : (
                          displayModules.map((module) => (
                            <div key={module.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${module.is_completed ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200 shadow-sm'}`}>
                              <div className="flex items-center gap-4 flex-1">
                                <div onClick={() => handleToggleModule(module)} className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${!isUserView ? 'cursor-pointer' : ''} ${module.is_completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300'}`}>
                                  {module.is_completed && <Check className="h-3.5 w-3.5" />}
                                </div>
                                <div>
                                  <p className={`text-sm font-bold ${module.is_completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{module.title}</p>
                                  {module.assignee_id && <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mt-1">Tutor: {getAvatar(module.assignee_id)?.name}</p>}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: SUMMARY / STUDENTS */}
                {modalTab === 'summary' && (
                  <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-sm text-center">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Enrolled Students</p>
                         <p className="text-2xl font-black text-purple-900">{courseInvoices.length}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-sm text-center">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Schedule</p>
                         <p className="text-sm font-bold text-slate-800 mt-2">{formData.approval_date || 'Start'} to {formData.due_date || 'End'}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-sm text-center">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Assigned Tutors</p>
                         <p className="text-2xl font-black text-blue-900">{formData.assignee_ids.length}</p>
                      </div>
                    </div>

                    {isAdminView && (
                       <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-5 space-y-4">
                          <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider">Enroll Student to Batch</h4>
                          <div className="space-y-3">
                             <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Select Existing Student</label>
                                <select value={selectedStudentId} onChange={e => { setSelectedStudentId(e.target.value); if(e.target.value) setNewStudent({name:"", phone:"", email:"", address:""}); }} className="w-full h-11 rounded-xl bg-white border border-purple-200 px-3 text-xs font-bold text-slate-800 outline-none">
                                   <option value="">-- Choose from Directory --</option>
                                   {availableStudents.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
                                </select>
                             </div>

                             <div className="relative flex py-1 items-center">
                                <div className="flex-grow border-t border-purple-200"></div>
                                <span className="flex-shrink mx-4 text-[10px] font-bold uppercase tracking-widest text-purple-400">Or Register New Student</span>
                                <div className="flex-grow border-t border-purple-200"></div>
                             </div>

                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input type="text" placeholder="Full Name *" value={newStudent.name} onChange={e => { setNewStudent({...newStudent, name: e.target.value}); setSelectedStudentId(""); }} className="h-11 rounded-xl bg-white border border-purple-200 px-3 text-xs font-medium outline-none" />
                                <input type="text" placeholder="Phone Number" value={newStudent.phone} onChange={e => { setNewStudent({...newStudent, phone: e.target.value}); setSelectedStudentId(""); }} className="h-11 rounded-xl bg-white border border-purple-200 px-3 text-xs font-medium outline-none" />
                                <input type="email" placeholder="Email Address" value={newStudent.email} onChange={e => { setNewStudent({...newStudent, email: e.target.value}); setSelectedStudentId(""); }} className="h-11 rounded-xl bg-white border border-purple-200 px-3 text-xs font-medium outline-none" />
                                <input type="text" placeholder="Residential Address" value={newStudent.address} onChange={e => { setNewStudent({...newStudent, address: e.target.value}); setSelectedStudentId(""); }} className="h-11 rounded-xl bg-white border border-purple-200 px-3 text-xs font-medium outline-none" />
                             </div>

                             <button onClick={handleEnrollStudent} disabled={isSaving} className="w-full h-11 bg-purple-900 text-white rounded-xl text-xs font-bold shadow-md hover:bg-purple-800 transition-colors mt-2">
                               {isSaving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Enroll Student & Generate Joining Invoice"}
                             </button>
                          </div>
                       </div>
                    )}

                    <div>
                       <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Enrolled Student Roster</h4>
                       <div className="space-y-2">
                          {courseInvoices.length === 0 ? <p className="text-xs italic text-slate-400">No students enrolled yet.</p> : courseInvoices.map(inv => {
                             const student = customers.find(c => c.id === inv.customer_id);
                             const total = parseFloat(inv.total_amount) || 0;
                             const paid = parseFloat(inv.amount_paid) || (inv.status === 'Paid' ? total : 0);

                             return (
                               <div key={inv.id} className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
                                  <div className="flex items-center gap-3">
                                     <div className="h-10 w-10 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-sm">{(student?.name || 'S').charAt(0)}</div>
                                     <div>
                                        <p className="text-sm font-bold text-slate-900">{student?.name || 'Unknown Student'}</p>
                                        <p className="text-[11px] text-slate-500 font-medium">
                                          {student?.phone || 'No Phone'} {student?.email ? `• ${student.email}` : ''}
                                        </p>
                                        {student?.address && <p className="text-[10px] text-slate-400 mt-0.5">{student.address}</p>}
                                     </div>
                                  </div>
                                  
                                  {isAdminView && (
                                     <div className="text-right flex flex-col items-end">
                                        <p className="text-sm font-black text-slate-900">₹{total.toLocaleString()}</p>
                                        <p className="text-[10px] font-bold text-emerald-600 mt-0.5">Paid: ₹{paid.toLocaleString()}</p>
                                        <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border mt-1 ${inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : inv.status?.toUpperCase().includes('PARTIAL') ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                           {inv.status}
                                        </span>
                                     </div>
                                  )}
                               </div>
                             );
                          })}
                       </div>
                    </div>
                  </div>
                )}

                {/* TAB 5: FINANCES (ADMIN ONLY) */}
                {isAdminView && modalTab === 'finances' && (
                  <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                       <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Fee Invoiced</p>
                          <p className="text-2xl font-black text-slate-900">₹{totalInvoiced.toLocaleString()}</p>
                       </div>
                       <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Collected</p>
                          <p className="text-2xl font-black text-emerald-600">₹{totalPaid.toLocaleString()}</p>
                       </div>
                       <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pending Balance</p>
                          <p className="text-2xl font-black text-rose-500">₹{totalDue.toLocaleString()}</p>
                       </div>
                    </div>

                    <div>
                       <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Individual Student Ledger</h4>
                       <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                          <div className="grid grid-cols-5 bg-slate-50 px-4 py-3 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                             <span className="col-span-2">Student Name</span>
                             <span>Invoice Ref</span>
                             <span className="text-right">Total Fee</span>
                             <span className="text-right">Paid / Status</span>
                          </div>
                          {courseInvoices.length === 0 ? <p className="text-xs italic text-slate-400 p-4">No financial records generated.</p> : courseInvoices.map(inv => {
                             const student = customers.find(c => c.id === inv.customer_id);
                             const total = parseFloat(inv.total_amount) || 0;
                             const paid = parseFloat(inv.amount_paid) || (inv.status === 'Paid' ? total : 0);

                             return (
                               <div key={inv.id} className="grid grid-cols-5 px-4 py-3.5 border-b border-slate-100 items-center text-xs last:border-none">
                                  <span className="col-span-2 font-bold text-slate-800">{student?.name || 'Unknown'}</span>
                                  <span className="text-slate-500 font-mono">{inv.invoice_number}</span>
                                  <span className="text-right font-black text-slate-900">₹{total.toLocaleString()}</span>
                                  <div className="text-right flex flex-col items-end">
                                     <span className="font-bold text-emerald-600">₹{paid.toLocaleString()}</span>
                                     <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider mt-1 ${inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : inv.status?.toUpperCase().includes('PARTIAL') ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'}`}>{inv.status}</span>
                                  </div>
                               </div>
                             );
                          })}
                       </div>
                    </div>
                  </div>
                )}

                {/* TAB 6: FACULTY PAYROLL (ADMIN ONLY) */}
                {isAdminView && modalTab === 'faculty' && (
                  <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6">
                    <div className="flex justify-between items-center">
                       <div>
                          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Faculty Directory & Class Reports Review</h4>
                          <p className="text-xs text-slate-500 mt-0.5">Click any faculty card to review their class reports, provide feedback, or manage payouts.</p>
                       </div>
                       <button onClick={() => setShowPayoutForm(!showPayoutForm)} className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors shadow-sm">
                          {showPayoutForm ? "Close Payout Form" : "Issue Payout / Advance"}
                       </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                       {(formData.assignee_ids || []).length === 0 ? <p className="text-xs italic text-slate-400 col-span-full">No faculty assigned to this batch.</p> : (formData.assignee_ids || []).map(empId => {
                          const emp = getAvatar(empId);
                          const empReport = reports.find(r => r.project_id === selectedCourse?.id && r.employee_id === empId);
                          const reportCount = empReport?.entries?.length || 0;
                          const taskDesc = formData.tutor_allocations[empId] || 'Assigned Tutor';

                          return (
                             <div key={empId} className="bg-white border border-slate-200 hover:border-purple-300 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all group">
                                <div className="flex items-start gap-3 mb-4">
                                   <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600 overflow-hidden shrink-0">
                                      {emp?.profile_image_url ? <img src={emp.profile_image_url} alt="" className="h-full w-full object-cover" /> : (emp?.name || 'U').charAt(0)}
                                   </div>
                                   <div className="min-w-0 flex-1">
                                      <p className="text-sm font-black text-slate-900 truncate">{emp?.name}</p>
                                      <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mt-0.5 truncate">{taskDesc}</p>
                                      <p className="text-[10px] text-slate-400 mt-1">{reportCount} Reports Submitted</p>
                                   </div>
                                </div>
                                <button onClick={() => setTimelineModalEmpId(empId)} className="w-full py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5">
                                   <Eye className="h-3.5 w-3.5" /> Review Reports
                                </button>
                             </div>
                          );
                       })}
                    </div>

                    <AnimatePresence>
                       {showPayoutForm && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden shrink-0">
                             <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-2">
                                <h4 className="text-[12px] sm:text-sm font-bold text-emerald-800 uppercase tracking-widest mb-4 sm:mb-5">Issue Payout / Advance</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                                   <div className="lg:col-span-1">
                                     <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1.5 px-1">Employee</label>
                                     <select value={paymentForm.employee_id} onChange={e => setPaymentForm({...paymentForm, employee_id: e.target.value})} className="w-full h-11 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-emerald-500 shadow-sm cursor-pointer"><option value="">-- Select --</option>{(formData.assignee_ids || []).map(id => <option key={id} value={id}>{getAvatar(id)?.name}</option>)}</select>
                                   </div>
                                   <div className="lg:col-span-1">
                                     <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1.5 px-1">Amount (₹)</label>
                                     <input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value)||0})} className="w-full h-11 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700 outline-none focus:border-emerald-500 shadow-sm min-w-0" />
                                   </div>
                                   <div className="lg:col-span-1">
                                     <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1.5 px-1">Type</label>
                                     <select value={paymentForm.payment_type} onChange={e => setPaymentForm({...paymentForm, payment_type: e.target.value})} className="w-full h-11 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-emerald-500 shadow-sm cursor-pointer"><option>Advance</option><option>Final Payout</option><option>Bonus / Incentive</option></select>
                                   </div>
                                   <div className="lg:col-span-2">
                                     <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1.5 px-1">Notes & Confirm</label>
                                     <div className="flex gap-2">
                                        <input type="text" placeholder="Details..." value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} className="flex-1 h-11 rounded-xl border border-emerald-200 bg-white px-3 text-xs outline-none min-w-0" />
                                        <button onClick={handleRecordFacultyPayment} disabled={isSaving} className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors shrink-0">Transfer</button>
                                     </div>
                                   </div>
                                </div>
                             </div>
                          </motion.div>
                       )}
                    </AnimatePresence>

                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                       <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                          <div className="col-span-3 text-left">Faculty Member</div>
                          <div className="col-span-2 text-emerald-600">Paid (₹)</div>
                          <div className="col-span-2">Base Salary</div>
                          <div className="col-span-2">Bonus / Incentive</div>
                          <div className="col-span-3 text-right">Balance Due</div>
                       </div>

                       {(formData.assignee_ids || []).length === 0 ? <p className="text-xs italic text-slate-400 p-6 text-center">No faculty assigned.</p> : (formData.assignee_ids || []).map(empId => {
                          const emp = getAvatar(empId);
                          const alloc = allocationsForm[empId] || { allocated: 0, incentive: 0 };
                          const empPaid = salaryPayments.filter(sp => sp.project_id === selectedCourse.id && sp.employee_id === empId).reduce((sum, sp) => sum + parseFloat(sp.amount || 0), 0);
                          const empPaymentsList = salaryPayments.filter(sp => sp.project_id === selectedCourse.id && sp.employee_id === empId);
                          const lineTotal = alloc.allocated + alloc.incentive;
                          const empBalance = Math.max(0, lineTotal - empPaid);
                          const isExpanded = expandedFinanceEmpId === empId;

                          return (
                             <div key={empId} className="flex flex-col border-b border-slate-100 last:border-none">
                                <div className="grid grid-cols-12 gap-2 items-center px-4 py-3 cursor-pointer hover:bg-slate-50" onClick={() => setExpandedFinanceEmpId(isExpanded ? null : empId)}>
                                   <div className="col-span-3 flex items-center gap-3">
                                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600 overflow-hidden shadow-sm">{emp?.profile_image_url ? <img src={emp.profile_image_url} alt="" className="h-full w-full object-cover" /> : (emp?.name || 'U').charAt(0).toUpperCase()}</div>
                                      <span className="text-xs font-bold text-slate-900">{emp?.name}</span>
                                      <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                   </div>
                                   <div className="col-span-2 text-xs font-bold text-emerald-600 text-center">₹{empPaid.toLocaleString()}</div>
                                   <div className="col-span-2" onClick={e => e.stopPropagation()}>
                                      <input type="number" value={alloc.allocated} onChange={e => setAllocationsForm({...allocationsForm, [empId]: {...alloc, allocated: parseFloat(e.target.value)||0}})} className="w-full h-8 border border-slate-200 rounded-lg text-xs font-bold text-center outline-none bg-white" />
                                   </div>
                                   <div className="col-span-2" onClick={e => e.stopPropagation()}>
                                      <input type="number" value={alloc.incentive} onChange={e => setAllocationsForm({...allocationsForm, [empId]: {...alloc, incentive: parseFloat(e.target.value)||0}})} className="w-full h-8 border border-purple-200 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold text-center outline-none" />
                                   </div>
                                   <div className="col-span-3 text-right text-xs font-black text-slate-900">₹{empBalance.toLocaleString()}</div>
                                </div>

                                <AnimatePresence>
                                   {isExpanded && (
                                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-slate-50/80 px-8 py-3 border-t border-slate-100">
                                         <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Payout Audit Trail</p>
                                         {empPaymentsList.length === 0 ? <p className="text-[11px] italic text-slate-500">No payouts disbursed yet.</p> : (
                                            <div className="space-y-1.5">
                                               {empPaymentsList.map(p => (
                                                  <div key={p.id} className="flex justify-between items-center text-[10px] bg-white border border-slate-200 p-2 rounded-lg">
                                                     <div className="flex items-center gap-2">
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                                        <span className="font-bold text-slate-700">{new Date(p.payment_date).toLocaleDateString()}</span>
                                                        <span className="text-slate-500">({p.payment_type}){p.notes && ` - ${p.notes}`}</span>
                                                     </div>
                                                     <div className="flex items-center gap-3">
                                                        <span className="font-black text-emerald-600">+ ₹{parseFloat(p.amount).toLocaleString()}</span>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteFacultyPayment(p.id); }} className="text-rose-500 hover:text-rose-700 p-1"><Trash2 className="h-3 w-3" /></button>
                                                     </div>
                                                  </div>
                                               ))}
                                            </div>
                                         )}
                                      </motion.div>
                                   )}
                                </AnimatePresence>
                             </div>
                          );
                       })}
                    </div>
                  </div>
                )}

                {/* MODIFIED: Fixed Modal Footer Alignment & Wired Handle Close */}
                <div className="p-4 sm:p-6 border-t border-slate-100 bg-[#FAFCFF] flex justify-end items-center gap-3 shrink-0 mt-auto">
                  {selectedCourse && isAdminView && modalTab === 'details' && (
                    <button onClick={handleDeleteCourse} disabled={isSaving} className="border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 rounded-xl h-11 px-5 flex items-center justify-center shadow-sm mr-auto transition-colors shrink-0"><Trash2 className="h-4 w-4" /></button>
                  )}
                  
                  <button onClick={handleCloseModal} className="rounded-xl border border-slate-200 bg-white h-11 px-6 font-bold text-[13px] text-slate-600 hover:bg-slate-50 shadow-sm transition-colors flex-1 sm:flex-none">Cancel</button>

                  {isAdminView && (
                    <>
                      {!selectedCourse && modalTab === 'details' && (
                        <button onClick={() => setModalTab('details_faculty')} className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl h-11 px-8 font-bold text-[13px] shadow-md transition-colors flex items-center justify-center flex-1 sm:flex-none">Next: Assign Faculty</button>
                      )}
                      {!selectedCourse && modalTab === 'details_faculty' && (
                        <button onClick={() => setModalTab('syllabus')} className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl h-11 px-8 font-bold text-[13px] shadow-md transition-colors flex items-center justify-center flex-1 sm:flex-none">Next: Build Syllabus</button>
                      )}
                      {!selectedCourse && modalTab === 'syllabus' && (
                        <button onClick={handleSaveCourse} disabled={isSaving} className="bg-purple-900 text-white hover:bg-purple-800 rounded-xl h-11 px-8 font-bold text-[13px] shadow-md transition-colors flex items-center justify-center flex-1 sm:flex-none">
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish & Create Batch"}
                        </button>
                      )}
                      {selectedCourse && (
                        <button onClick={handleSaveCourse} disabled={isSaving} className="bg-purple-900 text-white hover:bg-purple-800 rounded-xl h-11 px-8 font-bold text-[13px] shadow-md transition-colors flex items-center justify-center flex-1 sm:flex-none">
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                        </button>
                      )}
                    </>
                  )}
                </div>

              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}