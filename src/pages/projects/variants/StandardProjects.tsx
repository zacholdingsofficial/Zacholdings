import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, FolderKanban, CheckCircle2, AlertCircle, X, Check, User, Trash2, Clock, Download, Loader2, ChevronDown, ExternalLink, UploadCloud, Calendar, Info, Layers, FileText, Edit2, ThumbsUp, ThumbsDown, Eye, MessageCircle, CornerDownRight, Lock, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../../store/authStore";
import { useDataStore } from "../../../store/dataStore";
import { supabase } from "../../../supabase";

const STATUS_OPTIONS = ['Planning', 'In Progress', 'Review', 'Completed'];

const DEFAULT_MILESTONES = {
  in_progress: { drive_created: false, team_briefed: false, budget_cleared: false },
  review: { all_tasks_done: false, internal_qa: false },
  completed: { client_approved: false, final_handover: false }
};

export default function StandardProjects({ autoOpenProjectId }: { autoOpenProjectId?: number | null }) {
  const navigate = useNavigate();
  const { role, employeeId, activeWorkspace, companyId } = useAuthStore();
  const store = useDataStore();
  const { projects, tasks, reports, employees, companies, customers, salaryPayments, projectAllocations, fetchAllData } = store;

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"details" | "team" | "tasks" | "progress" | "finance">("details");
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [viewMode, setViewMode] = useState<'admin' | 'user'>('admin');
  const [roleSelectProject, setRoleSelectProject] = useState<any>(null);

  const isImpersonating = role === 'admin' && activeWorkspace !== null;
  const isGlobalAdmin = role === 'admin' && !isImpersonating;
  const isHead = role === 'head' || isImpersonating;
  const isUserView = role === 'user' || viewMode === 'user';
  const isAdminView = (isGlobalAdmin || isHead) && viewMode === 'admin';
  const currentCompanyId = isGlobalAdmin ? "" : (activeWorkspace || companyId);

  const [expandedFinanceEmpId, setExpandedFinanceEmpId] = useState<number | null>(null);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [showDriveHelp, setShowDriveHelp] = useState(false);
  const [showDescription, setShowDescription] = useState(false); 

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [taskToUpload, setTaskToUpload] = useState<any>(null);
  const [uploadNote, setUploadNote] = useState(""); 

  const [timelineModalEmpId, setTimelineModalEmpId] = useState<number | null>(null);
  const [reactionFormId, setReactionFormId] = useState<string | null>(null);
  const [reactionText, setReactionText] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryText, setEditingEntryText] = useState("");

  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({ 
    name: "", description: "", priority: "Medium", status: "Planning", expected_amount: 0, 
    approval_date: today, due_date: "", company_id: "", customer_id: "", internal_company_id: "", 
    drive_folder_url: "", assignee_ids: [] as number[], milestones: DEFAULT_MILESTONES
  });
  const [customerType, setCustomerType] = useState<"existing" | "new" | "in_house">("existing");
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState<number | "">("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);

  const [myReportText, setMyReportText] = useState("");
  const [isPrintingPayslip, setIsPrintingPayslip] = useState(false);

  const [allocationsForm, setAllocationsForm] = useState<{[empId: number]: {allocated: number, incentive: number}}>({});
  const [paymentForm, setPaymentForm] = useState({ employee_id: "", amount: 0, payment_type: "Advance", notes: "" });

  const currentCompany = companies.find((c: any) => c.id?.toString() === currentCompanyId?.toString());
  const showFinance = role === 'admin' || (role === 'head' && currentCompany?.allow_head_finance !== false);

  const myReport = selectedProject ? reports.find(r => r.project_id === selectedProject.id && r.employee_id === employeeId) : null;
  const myEntries = Array.isArray(myReport?.entries) ? myReport.entries : [];

  const adminTimelineReport = (selectedProject && timelineModalEmpId) ? reports.find(r => r.project_id === selectedProject.id && r.employee_id === timelineModalEmpId) : null;
  const adminTimelineEntries = Array.isArray(adminTimelineReport?.entries) ? adminTimelineReport.entries : [];

  const visibleProjects = projects.filter(p => {
    if (!p.name) return false;

    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "All" || p.status === filterStatus;

    if (isGlobalAdmin) {
      const matchesCompany = filterCompanyId === "all" || p.company_id?.toString() === filterCompanyId;
      return matchesSearch && matchesStatus && matchesCompany;
    }

    const isAssigned = isHead || (Array.isArray(p.assignee_ids) ? p.assignee_ids : []).includes(employeeId);
    return matchesSearch && matchesStatus && isAssigned && p.company_id?.toString() === currentCompanyId?.toString();
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const availableCustomers = customers.filter(c => c.company_id === parseInt(formData.company_id || '0'));
  
  const availableEmployees = employees.filter(emp => {
    const assignments = emp.company_roles && emp.company_roles.length > 0 
      ? emp.company_roles 
      : [{ company_id: emp.company_id, access_level: emp.access_level }];
      
    const hasGlobalAdmin = assignments.some((cr: any) => cr.access_level === 'admin');
    if (hasGlobalAdmin) return false;

    return assignments.some((cr: any) => cr.company_id?.toString() === formData.company_id?.toString());
  });

  useEffect(() => {
    if (autoOpenProjectId && projects.length > 0) {
      const projToOpen = projects.find((p: any) => p.id === autoOpenProjectId);
      if (projToOpen) {
        openProjectDetails(projToOpen, role === 'user' ? 'user' : 'admin');
      }
    }
  }, [autoOpenProjectId, projects, role]);

  const handleProjectClick = (project: any) => {
    const projComp = companies.find((c: any) => c.id === project.company_id);
    const isAcademyProj = projComp?.business_type === 'academy' || ['Course', 'Workshop', 'Internship'].includes(project.metadata?.type);

    if (isGlobalAdmin && isAcademyProj) {
      navigate('/projects', { state: { openProjectId: project.id, targetCompanyId: project.company_id } });
      return;
    }

    if ((role === 'admin' || role === 'head') && (Array.isArray(project.assignee_ids) ? project.assignee_ids : []).includes(employeeId)) {
      setRoleSelectProject(project);
    } else {
      openProjectDetails(project, role === 'user' ? 'user' : 'admin');
    }
  };

  const openNewProject = () => {
    setViewMode('admin');
    setSelectedProject(null);
    setFormData({ name: "", description: "", priority: "Medium", status: "Planning", expected_amount: 0, approval_date: today, due_date: "", company_id: currentCompanyId?.toString() || "", customer_id: "", internal_company_id: "", drive_folder_url: "", assignee_ids: [], milestones: DEFAULT_MILESTONES });
    setCustomerType("existing"); setNewCustomer({ name: "", phone: "" }); setPendingTasks([]); setNewTaskTitle(""); setNewTaskAssignee(""); setNewTaskDeadline("");
    setAllocationsForm({}); setExpandedFinanceEmpId(null); setShowPayoutForm(false); setShowDriveHelp(false); setShowDescription(false);
    setModalTab("details"); setIsModalOpen(true);
  };

  const openProjectDetails = (project: any, mode: 'admin' | 'user') => {
    setViewMode(mode);
    setRoleSelectProject(null);
    setSelectedProject(project);
    
    const safeMilestones = {
      in_progress: { ...DEFAULT_MILESTONES.in_progress, ...(project.milestones?.in_progress || {}) },
      review: { ...DEFAULT_MILESTONES.review, ...(project.milestones?.review || {}) },
      completed: { ...DEFAULT_MILESTONES.completed, ...(project.milestones?.completed || {}) }
    };

    setFormData({
      name: project.name || "", description: project.description || "", priority: project.priority || "Medium", status: project.status || "Planning", 
      expected_amount: project.expected_amount || 0, approval_date: project.approval_date || today, due_date: project.due_date || "", 
      company_id: project.company_id?.toString() || "", customer_id: project.customer_id?.toString() || "", 
      internal_company_id: project.internal_company_id?.toString() || "", drive_folder_url: project.drive_folder_url || "", 
      assignee_ids: Array.isArray(project.assignee_ids) ? project.assignee_ids : [],
      milestones: safeMilestones
    });
    setCustomerType(project.internal_company_id ? "in_house" : project.customer_id ? "existing" : "in_house"); 
    setNewCustomer({ name: "", phone: "" }); setPendingTasks([]); setNewTaskTitle(""); setNewTaskAssignee(""); setNewTaskDeadline("");
    setExpandedFinanceEmpId(null); setShowPayoutForm(false); setShowDriveHelp(false); setTimelineModalEmpId(null); setReactionFormId(null);
    setShowDescription(!!project.description);

    const currentAlloc: any = {};
    if (Array.isArray(project.assignee_ids)) {
      project.assignee_ids.forEach((id: number) => {
        const a = projectAllocations.find(pa => pa.project_id === project.id && pa.employee_id === id);
        currentAlloc[id] = { allocated: a?.allocated_amount || 0, incentive: a?.incentive_amount || 0 };
      });
    }
    setAllocationsForm(currentAlloc); 
    setModalTab("details"); 
    setIsModalOpen(true);
  };

  const handleMilestoneToggle = (phase: keyof typeof DEFAULT_MILESTONES, key: string) => {
    if (isUserView) return;
    const newMilestones = { ...formData.milestones };
    
    if (!newMilestones[phase]) newMilestones[phase] = { ...DEFAULT_MILESTONES[phase] };

    newMilestones[phase] = { 
       ...newMilestones[phase], 
       [key]: !newMilestones[phase][key as keyof typeof newMilestones[typeof phase]] 
    };

    let newStatus = formData.status;
    const inProgressReqs = Object.values(newMilestones.in_progress || {}).every(Boolean);
    const reviewReqs = Object.values(newMilestones.review || {}).every(Boolean);
    const completedReqs = Object.values(newMilestones.completed || {}).every(Boolean);

    if (completedReqs && reviewReqs && inProgressReqs) newStatus = 'Completed';
    else if (reviewReqs && inProgressReqs) newStatus = 'Review';
    else if (inProgressReqs) newStatus = 'In Progress';
    else newStatus = 'Planning';

    setFormData({ ...formData, milestones: newMilestones, status: newStatus });
  };

  const handleSaveProject = async () => {
    if (!formData.name.trim()) { setModalTab('details'); return alert(`Project name is required.`); }
    if (!formData.company_id) { setModalTab('details'); return alert(`Please select an Owning Subsidiary for this project.`); }

    let finalCustomerId: number | null = formData.customer_id ? parseInt(formData.customer_id) : null;
    let finalInternalId: number | null = null;

    setIsSaving(true);
    try {
      if (customerType === 'new') {
        if (!newCustomer.name.trim()) { setModalTab('details'); throw new Error(`New Client Name is required.`); }
        const { data: cData, error: cError } = await supabase.from('customers').insert([{ company_id: parseInt(formData.company_id), name: newCustomer.name, phone: newCustomer.phone }]).select().single();
        if (cError) throw cError;
        finalCustomerId = cData.id;
      } else if (customerType === 'in_house') { 
        finalCustomerId = null; 
        finalInternalId = formData.internal_company_id ? parseInt(formData.internal_company_id) : null;
      }

      const payload = { 
        ...formData, company_id: parseInt(formData.company_id), customer_id: finalCustomerId, internal_company_id: finalInternalId, 
        approval_date: formData.approval_date || null, due_date: formData.due_date || null, drive_folder_url: formData.drive_folder_url || null,
        milestones: formData.milestones
      };

      if (!selectedProject) {
        const { data, error } = await supabase.from('projects').insert([payload]).select().single();
        if (error) throw new Error(`Database Error: ${error.message}`);

        if (pendingTasks.length > 0) {
          const tasksToInsert = pendingTasks.map(t => ({ project_id: data.id, title: t.title, assignee_id: t.assignee_id, is_completed: t.is_completed, deadline: t.deadline }));
          await supabase.from('project_tasks').insert(tasksToInsert);
        }

      } else {
        const { error } = await supabase.from('projects').update(payload).eq('id', selectedProject.id);
        if (error) throw new Error(`Update Error: ${error.message}`);
      }

      await fetchAllData(); 
      if(modalTab === 'details' || modalTab === 'tasks') setIsModalOpen(false); 
      else alert(`Project updated successfully.`);
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedProject) return;
    if (formData.expected_amount <= 0) return alert("Expected Value must be greater than 0 to generate an invoice.");

    setIsSaving(true);
    try {
      const { data: existingInvoices, error: checkError } = await supabase
        .from('invoices')
        .select('id')
        .eq('project_id', selectedProject.id);

      if (checkError) throw checkError;
      if (existingInvoices && existingInvoices.length > 0) {
        return alert(`An invoice has already been generated for this project.`);
      }

      const invPayload = {
        company_id: selectedProject.company_id,
        customer_id: selectedProject.customer_id,
        project_id: selectedProject.id,
        invoice_number: `INV-${Math.floor(10000 + Math.random() * 90000)}`,
        issue_date: today,
        due_date: selectedProject.due_date || today,
        subtotal: formData.expected_amount,
        total_amount: formData.expected_amount,
        status: 'Pending'
      };

      const { data: invData, error: invError } = await supabase.from('invoices').insert([invPayload]).select().single();
      if (invError) throw new Error(`Auto-Invoice Error: ${invError.message}`);

      if (invData) {
        const { error: itemError } = await supabase.from('invoice_items').insert([{ 
          invoice_id: invData.id, 
          description: `Project: ${selectedProject.name}`, 
          quantity: 1, 
          rate: formData.expected_amount, 
          total: formData.expected_amount 
        }]);
        if (itemError) throw new Error(`Invoice Line Item Error: ${itemError.message}`);
      }

      alert("Invoice generated and approved successfully!");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAllocations = async () => {
    if (!selectedProject) return;
    setIsSaving(true);
    try {
      for (const empId of Object.keys(allocationsForm)) {
        const alloc = allocationsForm[parseInt(empId)];
        await supabase.from('project_allocations').upsert({ project_id: selectedProject.id, employee_id: parseInt(empId), allocated_amount: alloc.allocated, incentive_amount: alloc.incentive }, { onConflict: 'project_id, employee_id' });
      }
      alert("Allocations saved successfully.");
      await fetchAllData();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleRecordProjectPayment = async () => {
    if (!paymentForm.employee_id || paymentForm.amount <= 0) return alert("Select an employee and enter an amount.");
    setIsSaving(true);
    try {
      const { error } = await supabase.from('salary_payments').insert([{
        employee_id: parseInt(paymentForm.employee_id), company_id: selectedProject.company_id, project_id: selectedProject.id,
        amount: paymentForm.amount, payment_type: paymentForm.payment_type, payment_date: today, payment_month: today.substring(0, 7), notes: paymentForm.notes
      }]);
      if (error) throw new Error(`Database Error: ${error.message}`);

      setPaymentForm({ employee_id: "", amount: 0, payment_type: "Advance", notes: "" });
      setExpandedFinanceEmpId(parseInt(paymentForm.employee_id)); 
      setShowPayoutForm(false); 
      await fetchAllData();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleDeleteProjectPayment = async (paymentId: number) => {
    if (!window.confirm("Remove this payment record?")) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('salary_payments').delete().eq('id', paymentId);
      if (error) throw new Error(`Delete Error: ${error.message}`);
      await fetchAllData();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleSaveMyReport = async () => {
    if (!selectedProject || !myReportText.trim()) return;
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id === selectedProject.id && r.employee_id === employeeId);

      const newEntry = {
        id: crypto.randomUUID(),
        type: 'note',
        text: myReportText.trim(),
        timestamp: new Date().toISOString()
      };

      const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];

      await supabase.from('project_reports').upsert({ 
        project_id: selectedProject.id, 
        employee_id: employeeId, 
        entries: [...currentEntries, newEntry] 
      }, { onConflict: 'project_id, employee_id' });

      setMyReportText(""); 
      await fetchAllData();
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleEditUserEntry = async (entryId: string) => {
    if (!selectedProject || !editingEntryText.trim()) return;
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id === selectedProject.id && r.employee_id === employeeId);
      if (!existingReport) return;

      const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];
      const updatedEntries = currentEntries.map((e: any) => 
        e.id === entryId ? { ...e, text: editingEntryText.trim() } : e
      );

      await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);

      setEditingEntryId(null);
      setEditingEntryText("");
      await fetchAllData();
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleDeleteEntry = async (empId: number, entryId: string) => {
    if (!window.confirm("Delete this log entry?")) return;
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id === selectedProject.id && r.employee_id === empId);
      if (!existingReport) return;

      const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];
      const updatedEntries = currentEntries.filter((e: any) => e.id !== entryId);
      await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
      await fetchAllData();
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleAdminReact = async (empId: number, entryId: string, status: string, customText: string = "") => {
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id === selectedProject.id && r.employee_id === empId);
      if (!existingReport) return;

      const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];
      const updatedEntries = currentEntries.map((e: any) => {
        if (e.id === entryId) {
          return {
            ...e,
            reaction: { status, text: customText.trim(), timestamp: new Date().toISOString() }
          };
        }
        return e;
      });

      await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
      setReactionFormId(null);
      setReactionText("");
      await fetchAllData();
    } catch (e: any) { alert("Failed to add reaction: " + e.message); } finally { setIsSaving(false); }
  };

  const handleDeleteReaction = async (empId: number, entryId: string) => {
    if (!window.confirm("Remove this feedback?")) return;
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id === selectedProject.id && r.employee_id === empId);
      if (!existingReport) return;

      const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];
      const updatedEntries = currentEntries.map((e: any) => {
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

  const handleDeleteProject = async () => {
    if (!window.confirm(`Delete "${selectedProject.name}"?`)) return;
    setIsSaving(true);
    await supabase.from('projects').delete().eq('id', selectedProject.id);
    await fetchAllData(); setIsModalOpen(false); setIsSaving(false);
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !newTaskAssignee || !newTaskDeadline) return;
    if (formData.due_date && new Date(newTaskDeadline) > new Date(formData.due_date)) {
      alert(`Task deadline cannot exceed the project's main due date (${formData.due_date}).`);
      return;
    }

    if (selectedProject) {
      await supabase.from('project_tasks').insert([{ project_id: selectedProject.id, title: newTaskTitle, assignee_id: newTaskAssignee || null, deadline: newTaskDeadline || null }]);
      await fetchAllData();
    } else { 
      setPendingTasks([...pendingTasks, { title: newTaskTitle, assignee_id: newTaskAssignee || null, is_completed: false, deadline: newTaskDeadline || null }]); 
    }
    setNewTaskTitle(""); setNewTaskAssignee(""); setNewTaskDeadline("");
  };

  const handleUpdateTaskDeadline = async (task: any, index: number, newDeadline: string) => {
    if (formData.due_date && new Date(newDeadline) > new Date(formData.due_date)) {
      alert(`Task deadline cannot exceed the project's main due date (${formData.due_date}).`);
      return;
    }
    if (selectedProject) {
      await supabase.from('project_tasks').update({ deadline: newDeadline }).eq('id', task.id);
      await fetchAllData();
    } else {
      const updated = [...pendingTasks]; 
      updated[index].deadline = newDeadline; 
      setPendingTasks(updated);
    }
  };

  const handleAdminToggleTask = async (task: any, index?: number) => {
    if (isUserView) return; 
    if (selectedProject) {
      await supabase.from('project_tasks').update({ is_completed: !task.is_completed }).eq('id', task.id);
      await fetchAllData();
    } else if (index !== undefined) {
      const updated = [...pendingTasks]; updated[index].is_completed = !updated[index].is_completed; setPendingTasks(updated);
    }
  };

  const handleEmployeeUploadComplete = async () => {
    if (!taskToUpload || !selectedProject) return;
    if (!uploadNote.trim()) return alert("Please provide a brief note detailing what you uploaded or updated.");

    setIsSaving(true);
    try {
      await supabase.from('project_tasks').update({ is_completed: true }).eq('id', taskToUpload.id);

      const existingReport = reports.find(r => r.project_id === selectedProject.id && r.employee_id === employeeId);
      const newEntry = {
        id: crypto.randomUUID(),
        type: 'upload',
        task_title: taskToUpload.title,
        text: uploadNote.trim(),
        timestamp: new Date().toISOString()
      };
      const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];

      await supabase.from('project_reports').upsert({ 
        project_id: selectedProject.id, 
        employee_id: employeeId, 
        entries: [...currentEntries, newEntry] 
      }, { onConflict: 'project_id, employee_id' });

      await fetchAllData();
      setIsUploadModalOpen(false);
      setTaskToUpload(null);
      setUploadNote("");
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handlePrintPayslip = () => {
    setIsPrintingPayslip(true);
    setTimeout(() => { window.print(); setIsPrintingPayslip(false); }, 100);
  };

  const getAvatar = (id: number) => employees.find(e => e.id === id);

  const displayTasks = selectedProject ? tasks.filter(t => t.project_id === selectedProject.id).sort((a, b) => (a.id > b.id ? 1 : -1)) : pendingTasks;

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'Planning': return 'bg-slate-50 text-slate-700 border-slate-200';
      case 'In Progress': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Review': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Completed': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getDueDateStatus = (dateString: string) => {
    if (!dateString) return null;
    const due = new Date(dateString);
    const now = new Date(today);
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'Overdue', style: 'text-rose-500 bg-rose-50 border-rose-200', icon: AlertCircle, dot: 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' };
    if (diffDays === 0) return { label: 'Due Today', style: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock, dot: 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' };
    if (diffDays <= 7) return { label: `Due in ${diffDays}d`, style: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: Clock, dot: 'bg-emerald-500' };
    return { label: `Due in ${diffDays}d`, style: 'text-slate-500 bg-slate-50 border-slate-200', icon: Calendar, dot: 'bg-slate-300' };
  };

  const getReactionVisuals = (status: string) => {
    switch(status) {
      case 'Approved': return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: ThumbsUp };
      case 'Rejected': return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: ThumbsDown };
      case 'Reviewed': return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Eye };
      default: return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: MessageCircle };
    }
  };

  const userAllocation = selectedProject ? projectAllocations.find(pa => pa.project_id === selectedProject.id && pa.employee_id === employeeId) : null;
  const userProjectPayments = selectedProject ? salaryPayments.filter(sp => sp.project_id === selectedProject.id && sp.employee_id === employeeId) : [];
  const userTotalEarned = userProjectPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const userTotalAllocated = (userAllocation?.allocated_amount || 0) + (userAllocation?.incentive_amount || 0);
  const userBalanceDue = Math.max(0, userTotalAllocated - userTotalEarned);

  const hasAllocationChanges = selectedProject && (Array.isArray(formData.assignee_ids) ? formData.assignee_ids : []).some(empId => {
    const formAlloc = allocationsForm[empId] || { allocated: 0, incentive: 0 };
    const originalAlloc = projectAllocations.find(pa => pa.project_id === selectedProject.id && pa.employee_id === empId);
    return Number(formAlloc.allocated) !== Number(originalAlloc?.allocated_amount || 0) || Number(formAlloc.incentive) !== Number(originalAlloc?.incentive_amount || 0);
  });

  return (
    <>
      <div className="max-w-[1200px] mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-700 pb-8 relative z-0 print:p-0 print:m-0">

        <div className="absolute inset-0 pointer-events-none z-[-1] overflow-hidden print:hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4wOCkiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,white,transparent)]" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6 print:hidden">
          <div>
            <p className="text-[9px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-1.5 sm:mb-2 bg-blue-50 inline-block px-3 py-1 rounded-full">Workflows & Tasks</p>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-1 sm:mt-2">Projects.</h1>
          </div>
          {(role === 'admin' || role === 'head') && (
            <button onClick={openNewProject} className="bg-gradient-to-r from-blue-900 to-indigo-800 text-white shadow-lg shadow-blue-900/20 hover:shadow-xl hover:-translate-y-0.5 px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-[13px] font-bold transition-all flex items-center shrink-0">
              <Plus className="h-4 w-4 mr-1.5 sm:mr-2" /> New Project
            </button>
          )}
        </div>

        <div className="bg-white p-2 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-2 print:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 w-3.5 sm:w-4 text-slate-400" />
            <input type="text" placeholder="Search projects by name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-10 sm:h-11 pl-9 sm:pl-11 pr-4 rounded-lg sm:rounded-xl border-none text-[13px] sm:text-sm font-medium outline-none bg-transparent focus:ring-0 placeholder:text-slate-400" />
          </div>

          {role === 'admin' && !activeWorkspace && (
            <div className="sm:w-64 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-2">
              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                className="w-full h-10 sm:h-11 rounded-lg sm:rounded-xl bg-slate-50 border-none px-3 sm:px-4 text-[12px] sm:text-sm font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors focus:ring-4 focus:ring-blue-500/10 appearance-none"
                style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px' }}
              >
                <option value="all">Global (All Subsidiaries)</option>
                {companies.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div className="sm:w-48 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-2">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full h-10 sm:h-11 rounded-lg sm:rounded-xl bg-slate-50 border-none px-3 sm:px-4 text-[12px] sm:text-sm font-bold text-slate-700 outline-none cursor-pointer appearance-none"
               style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px' }}
            >
               <option value="All">All Statuses</option>
               {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-4 print:hidden">
          {visibleProjects.length === 0 ? (
             <div className="h-48 sm:h-64 border border-slate-200 border-dashed rounded-2xl sm:rounded-3xl flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                <FolderKanban className="h-8 w-8 sm:h-10 sm:w-10 mb-2 sm:mb-3 text-slate-300" />
                <p className="text-[11px] sm:text-sm font-bold uppercase tracking-wider">No Records Found</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
              {visibleProjects.map(project => {
                const projectTasks = tasks.filter(t => t.project_id === project.id);
                const completedTasks = projectTasks.filter(t => t.is_completed).length;
                const totalTasks = projectTasks.length;
                const progressPct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
                const radius = 18; const circumference = 2 * Math.PI * radius; const progressOffset = circumference - (progressPct / 100) * circumference;

                const dueStatus = project.status !== 'Completed' ? getDueDateStatus(project.due_date) : null;
                
                // Academy Project Check
                const projComp = companies.find(c => c.id === project.company_id);
                const isAcademyProj = projComp?.business_type === 'academy' || ['Course', 'Workshop', 'Internship'].includes(project.metadata?.type);
                const owningCompanyName = projComp?.name;

                return (
                  <div 
                     key={project.id} 
                     className={`bg-white rounded-2xl sm:rounded-3xl border shadow-sm hover:shadow-md transition-all flex flex-col relative overflow-hidden group ${isAcademyProj ? 'border-purple-100 hover:border-purple-300 shadow-purple-900/5' : 'border-slate-100 hover:border-blue-200'}`}
                  >
                    <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${project.priority === 'High' ? 'bg-rose-500' : project.priority === 'Medium' ? 'bg-amber-500' : 'bg-slate-300'}`} />

                    {dueStatus && (
                      <div className={`ml-1.5 px-3 sm:px-4 py-1.5 sm:py-2 border-b flex items-center justify-center gap-1.5 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest ${dueStatus.style}`}>
                        <dueStatus.icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> {dueStatus.label}
                      </div>
                    )}

                    <div className="ml-1.5 p-4 sm:p-7 flex flex-col gap-4 sm:gap-6">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                             {isAcademyProj && <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-600 border border-purple-100 text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"><BookOpen className="h-2.5 w-2.5" /> Academy Program</span>}
                          </div>
                          
                          <h3 onClick={() => handleProjectClick(project)} className={`text-[15px] sm:text-lg font-bold tracking-tight cursor-pointer transition-colors inline-block w-full truncate ${isAcademyProj ? 'text-purple-950 hover:text-purple-700' : 'text-slate-900 hover:text-blue-900'}`}>
                            {project.name}
                            {isGlobalAdmin && owningCompanyName && (
                                <span className="ml-2 inline-block text-[9px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200 align-middle">
                                  {owningCompanyName}
                                </span>
                            )}
                          </h3>
                          <p className="text-[9px] sm:text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 sm:mt-1 truncate w-full">
                            {!isGlobalAdmin && (owningCompanyName || 'Network')} 
                            {project.customer_id && ` • ${customers.find(c => c.id === project.customer_id)?.name}`}
                            {project.internal_company_id && ` • Internal`}
                          </p>
                        </div>

                        <div className="shrink-0 flex justify-end">
                           <div className={`px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-widest border shadow-sm ${getStatusStyle(project.status || 'Planning')}`}>
                             {project.status || 'Planning'}
                           </div>
                        </div>
                      </div>

                      <div className="flex flex-row items-center justify-between pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="flex items-center gap-3 sm:gap-4">
                           <div className="relative h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center shrink-0">
                             <svg className="h-10 w-10 sm:h-12 sm:w-12 transform -rotate-90">
                               <circle cx="50%" cy="50%" r="18" stroke="currentColor" strokeWidth="3.5" fill="transparent" className="text-slate-100" />
                               <circle cx="50%" cy="50%" r="18" stroke="currentColor" strokeWidth="3.5" fill="transparent" strokeDasharray={circumference} strokeDashoffset={progressOffset} strokeLinecap="round" className={`${progressPct === 100 ? 'text-emerald-500' : (isAcademyProj ? 'text-purple-600' : 'text-blue-900')} transition-all duration-1000 ease-out`} />
                             </svg>
                             <div className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[11px] font-bold text-slate-800">{progressPct}%</div>
                           </div>
                           <div className="hidden sm:block">
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{isAcademyProj ? 'Modules' : 'Tasks'}</p>
                             <p className="text-sm font-bold text-slate-800">{completedTasks} / {totalTasks}</p>
                           </div>
                           <div className="flex -space-x-2 pl-2 border-l border-slate-100 sm:border-none sm:pl-0">
                             {(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).slice(0, 4).map((id: number) => {
                               const emp = getAvatar(id);
                               return (
                                 <div key={id} className="h-7 w-7 sm:h-8 sm:w-8 rounded-full border-2 border-white bg-slate-50 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-slate-600 overflow-hidden shadow-sm" title={emp?.name}>
                                   {emp?.profile_image_url ? <img src={emp.profile_image_url} alt="Profile" className="h-full w-full object-cover" /> : (emp?.name || 'U').charAt(0).toUpperCase()}
                                 </div>
                               )
                             })}
                             {(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).length > 4 && <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full border-2 border-white bg-slate-50 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-slate-600 shadow-sm">+{(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).length - 4}</div>}
                             {(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).length === 0 && <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 pl-2">Unassigned</span>}
                           </div>
                        </div>

                        {showFinance && (
                          <div className="flex flex-col items-end">
                            <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{isAcademyProj ? 'Batch Value' : 'Value'}</span>
                            <span className="text-[12px] sm:text-sm font-black text-emerald-600">₹{(project.expected_amount || 0).toLocaleString()}</span>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {isPrintingPayslip && selectedProject && isUserView && (
          <div className="absolute inset-0 bg-white z-[100] p-10 print:block hidden">
            <div className="text-center mb-10 pb-6 border-b border-slate-200">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Project Payment Remittance</h1>
              <p className="text-sm font-bold text-slate-500 mt-2 uppercase tracking-widest">{selectedProject.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-10 mb-10 text-sm">
               <div>
                 <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-1">Prepared For</p>
                 <p className="font-bold text-slate-900 text-lg">{getAvatar(employeeId)?.name}</p>
                 <p className="text-slate-600 font-medium">{getAvatar(employeeId)?.role}</p>
               </div>
               <div className="text-right">
                 <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-1">Date Issued</p>
                 <p className="font-bold text-slate-900">{new Date().toLocaleDateString()}</p>
               </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden mb-10">
               <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between font-bold text-slate-800 text-xs uppercase tracking-widest">
                 <span>Compensation Breakdown</span>
                 <span>Amount</span>
               </div>
               <div className="px-6 py-5 flex justify-between border-b border-slate-100">
                  <span className="font-medium text-slate-700">Project Allocation</span>
                  <span className="font-bold">₹{(userAllocation?.allocated_amount || 0).toLocaleString()}</span>
               </div>
               <div className="px-6 py-5 flex justify-between border-b border-slate-100">
                  <span className="font-medium text-slate-700">Performance Incentive</span>
                  <span className="font-bold text-emerald-600">+ ₹{(userAllocation?.incentive_amount || 0).toLocaleString()}</span>
               </div>
               <div className="px-6 py-5 bg-slate-50 flex justify-between">
                  <span className="font-bold text-slate-900 text-lg">Total Earnings</span>
                  <span className="font-black text-slate-900 text-lg">₹{userTotalAllocated.toLocaleString()}</span>
               </div>
            </div>

            <div className="mb-10">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Payment History</h3>
               {userProjectPayments.length === 0 ? <p className="text-sm italic text-slate-500">No payments disbursed yet.</p> : (
                 <div className="space-y-2">
                   {userProjectPayments.map(p => (
                     <div key={p.id} className="flex justify-between items-center border-b border-slate-100 pb-2 text-sm">
                        <span className="text-slate-600">{new Date(p.payment_date).toLocaleDateString()} - {p.payment_type}</span>
                        <span className="font-bold text-slate-800">₹{parseFloat(p.amount).toLocaleString()}</span>
                     </div>
                   ))}
                 </div>
               )}
            </div>

            <div className="flex justify-end pt-6 border-t border-slate-200">
               <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Current Balance Due</p>
                  <p className="text-2xl font-black text-slate-900">₹{userBalanceDue.toLocaleString()}</p>
               </div>
            </div>
          </div>
        )}

      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {roleSelectProject && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
               <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-2xl flex flex-col">
                  <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4"><Layers className="h-6 w-6" /></div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight mb-2">Open Workspace As</h3>
                  <p className="text-xs font-medium text-slate-500 mb-6">You are assigned to tasks on <strong className="text-slate-800">{roleSelectProject.name}</strong>. How would you like to view it?</p>

                  <div className="space-y-3">
                    <button onClick={() => openProjectDetails(roleSelectProject, 'admin')} className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-3.5 text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2">
                       Manage Workspace (Admin)
                    </button>
                    <button onClick={() => openProjectDetails(roleSelectProject, 'user')} className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl py-3.5 text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2">
                       My Tasks (User)
                    </button>
                  </div>

                  <button onClick={() => setRoleSelectProject(null)} className="mt-5 w-full text-slate-400 hover:text-slate-600 font-bold text-xs uppercase tracking-wider transition-colors">Cancel</button>
               </motion.div>
             </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {timelineModalEmpId && isAdminView && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10005] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-[#FAFCFF] rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
                 <div className="px-6 py-5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                       <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 overflow-hidden border border-slate-200">
                          {getAvatar(timelineModalEmpId)?.profile_image_url ? <img src={getAvatar(timelineModalEmpId)?.profile_image_url} alt="" className="h-full w-full object-cover" /> : (getAvatar(timelineModalEmpId)?.name || 'U').charAt(0).toUpperCase()}
                       </div>
                       <div>
                         <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">{getAvatar(timelineModalEmpId)?.name}</h3>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Timeline & Updates</p>
                       </div>
                    </div>
                    <button onClick={() => {setTimelineModalEmpId(null); setReactionFormId(null);}} className="h-8 w-8 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-500 transition-colors"><X className="h-4 w-4" /></button>
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {adminTimelineEntries.length > 0 ? (
                       adminTimelineEntries.map((entry: any) => {
                          const hasReaction = !!entry.reaction;
                          const visual = getReactionVisuals(entry.reaction?.status);

                          return (
                            <div key={entry.id} className="flex flex-col relative group">
                               <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm z-10 relative">
                                  {entry.type === 'upload' && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-bold uppercase tracking-wider rounded-lg mb-3">
                                       <FileText className="h-3 w-3" /> Attached File: {entry.task_title}
                                    </span>
                                  )}
                                  <p className="text-[13px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{entry.text}</p>
                                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date(entry.timestamp).toLocaleString()}</span>
                                     {!hasReaction && reactionFormId !== entry.id && (
                                       <button onClick={() => setReactionFormId(entry.id)} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider transition-colors flex items-center gap-1"><Plus className="h-3 w-3"/> Add Feedback</button>
                                     )}
                                  </div>
                               </div>

                               {hasReaction && reactionFormId !== entry.id && (
                                  <div className="ml-6 sm:ml-10 mt-2 relative">
                                     <CornerDownRight className="absolute -left-5 top-3 h-4 w-4 text-slate-300" />
                                     <div className={`p-3.5 rounded-xl border ${visual.bg} ${visual.border}`}>
                                        <div className="flex items-center justify-between mb-1.5">
                                           <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${visual.text}`}>
                                              <visual.icon className="h-3.5 w-3.5" /> {entry.reaction.status}
                                           </span>
                                           <div className="flex gap-2">
                                              <button onClick={() => setReactionFormId(entry.id)} className={`text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity ${visual.text} hover:opacity-70`}><Edit2 className="h-3 w-3"/></button>
                                              <button onClick={() => handleDeleteReaction(timelineModalEmpId, entry.id)} className={`text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity text-rose-500 hover:opacity-70`}><Trash2 className="h-3 w-3"/></button>
                                           </div>
                                        </div>
                                        {entry.reaction.text && <p className={`text-xs mt-1 ${visual.text} opacity-90`}>{entry.reaction.text}</p>}
                                     </div>
                                  </div>
                               )}

                               {reactionFormId === entry.id && (
                                  <div className="ml-6 sm:ml-10 mt-3 relative animate-in fade-in slide-in-from-top-2">
                                     <CornerDownRight className="absolute -left-5 top-3 h-4 w-4 text-slate-300" />
                                     <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-lg">
                                        <div className="flex items-center justify-between mb-3">
                                           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Provide Feedback</span>
                                           <button onClick={() => setReactionFormId(null)} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mb-3">
                                           <button onClick={() => handleAdminReact(timelineModalEmpId, entry.id, 'Approved', reactionText)} disabled={isSaving} className="flex-1 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"><ThumbsUp className="h-3 w-3"/> Approve</button>
                                           <button onClick={() => handleAdminReact(timelineModalEmpId, entry.id, 'Rejected', reactionText)} disabled={isSaving} className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"><ThumbsDown className="h-3 w-3"/> Reject</button>
                                           <button onClick={() => handleAdminReact(timelineModalEmpId, entry.id, 'Reviewed', reactionText)} disabled={isSaving} className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"><Eye className="h-3 w-3"/> Seen</button>
                                        </div>
                                        <textarea 
                                           value={reactionText} 
                                           onChange={(e) => setReactionText(e.target.value)}
                                           placeholder="Optional detailed comment..." 
                                           className="w-full h-16 rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-slate-400 resize-none mb-3 bg-slate-50"
                                        />
                                        <button onClick={() => handleAdminReact(timelineModalEmpId, entry.id, 'Comment', reactionText)} disabled={isSaving || !reactionText.trim()} className="w-full h-9 bg-slate-900 text-white rounded-lg text-[11px] font-bold uppercase tracking-wider disabled:opacity-50">Submit Note</button>
                                     </div>
                                  </div>
                               )}
                            </div>
                          )
                       })
                    ) : (
                       <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                          <Clock className="h-10 w-10 text-slate-400 mb-3" />
                          <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">No entries yet.</p>
                       </div>
                    )}
                 </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isUploadModalOpen && taskToUpload && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="bg-gradient-to-r from-blue-900 to-indigo-800 p-6 sm:p-8 text-center relative">
                  <button onClick={() => setIsUploadModalOpen(false)} className="absolute top-4 right-4 h-8 w-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"><X className="h-4 w-4" /></button>
                  <div className="h-16 w-16 bg-white/20 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-inner backdrop-blur-md">
                    <UploadCloud className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Project Drive</h3>
                  <p className="text-[11px] sm:text-xs font-medium text-blue-100 mt-2 opacity-90">{taskToUpload.title}</p>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800">Upload to Secure Workspace</p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">Click below to open the secure project drive. Drag and drop your files into the folder.</p>
                        <a href={selectedProject?.drive_folder_url || "#"} target="_blank" rel="noopener noreferrer" className={`mt-3 w-full flex items-center justify-center gap-2 h-11 rounded-xl text-xs font-bold transition-all ${selectedProject?.drive_folder_url ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200' : 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'}`}>
                          {selectedProject?.drive_folder_url ? <><ExternalLink className="h-4 w-4" /> Open Project Drive</> : "No Drive Link Provided"}
                        </a>
                      </div>
                    </div>

                    <div className="w-full h-px bg-slate-100" />

                    <div className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800">Add an Update Note *</p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed mb-3">Provide a brief description of the files you just uploaded.</p>
                        <textarea 
                           value={uploadNote}
                           onChange={(e) => setUploadNote(e.target.value)}
                           placeholder="e.g., Uploaded the revised V2 floorplans in PDF format..."
                           className="w-full h-24 rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-blue-500 shadow-sm resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  <button onClick={handleEmployeeUploadComplete} disabled={isSaving || !selectedProject?.drive_folder_url} className="w-full h-12 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-[13px] font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center disabled:opacity-50">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : taskToUpload.is_completed ? "Update Log & Confirm" : "Mark Task as Completed"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isModalOpen && !isPrintingPayslip && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 z-[9999] flex flex-col items-center justify-center max-sm:px-4 max-sm:pt-20 max-sm:pb-[110px] sm:p-4 bg-slate-900/40 backdrop-blur-sm print:hidden"
            >
              <motion.div 
                initial={{ opacity: 0, y: 40, scale: 0.95 }} 
                animate={{ opacity: 1, y: 0, scale: 1 }} 
                exit={{ opacity: 0, y: 40, scale: 0.95 }} 
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-5xl h-full sm:h-[760px] sm:max-h-[90vh] flex flex-col overflow-hidden border border-slate-100 mt-auto sm:mt-0"
              >

                <div className="px-5 sm:px-8 pt-5 sm:pt-7 border-b border-slate-100 bg-[#FAFCFF] shrink-0">
                  <div className="flex items-center justify-between mb-4 sm:mb-5">
                    <div className="pr-4">
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2 sm:px-2.5 py-1 rounded-full">{isAdminView ? 'Admin Workspace' : 'User Workspace'}</span>
                      <h3 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight mt-1.5 truncate">{selectedProject ? selectedProject.name : 'Create New Project'}</h3>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="h-8 w-8 sm:h-9 sm:w-9 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm transition-colors shrink-0"><X className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button>
                  </div>

                  <div className="flex gap-4 sm:gap-8 overflow-x-auto max-sm:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {!selectedProject ? (
                      <>
                        <div className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'details' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-400'}`}>Step 1: Details</div>
                        <div className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'team' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-400'}`}>Step 2: Assign Team</div>
                        <div className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'tasks' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-400'}`}>Step 3: Action Items</div>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setModalTab('details')} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'details' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>1. Details</button>
                        <button onClick={() => setModalTab('team')} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'team' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>2. Team</button>
                        <button onClick={() => setModalTab('tasks')} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${modalTab === 'tasks' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>3. Action Items</button>
                        <button onClick={() => setModalTab('progress')} disabled={!selectedProject} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${!selectedProject ? 'opacity-30 cursor-not-allowed' : modalTab === 'progress' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>4. Timeline</button>
                        
                        {/* STRICT FINANCE ACCESS LOCK ON TABS */}
                        {showFinance && (
                          <button onClick={() => setModalTab('finance')} disabled={!selectedProject} className={`pb-2.5 sm:pb-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${!selectedProject ? 'opacity-30 cursor-not-allowed' : modalTab === 'finance' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>5. Budget & Finances</button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* TAB 1: DETAILS */}
                {modalTab === 'details' && (
                  <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-5 sm:p-8 flex flex-col sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar-thumb]:bg-slate-300 sm:[&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar-track]:bg-transparent max-sm:[&::-webkit-scrollbar]:hidden max-sm:[-ms-overflow-style:none] max-sm:[scrollbar-width:none]">

                    {isUserView ? (
                      <div className="flex-1 max-w-4xl mx-auto w-full">
                        <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 sm:p-8 space-y-8">
                          <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{formData.name}</h2>
                            <p className="text-sm font-medium text-slate-600 mt-3 leading-relaxed">{formData.description || 'No detailed description provided for this project.'}</p>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6 border-t border-slate-200">
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Client</p>
                              <p className="text-[13px] font-bold text-slate-800">{customerType === 'existing' ? customers.find(c => c.id.toString() === formData.customer_id)?.name : 'Internal Node'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Due Date</p>
                              <p className="text-[13px] font-bold text-slate-800">{formData.due_date ? new Date(formData.due_date).toLocaleDateString() : 'TBD'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Priority</p>
                              <div className="flex items-center gap-1.5">
                                <div className={`h-2 w-2 rounded-full ${formData.priority === 'High' ? 'bg-rose-500' : formData.priority === 'Medium' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                                <p className="text-[13px] font-bold text-slate-800">{formData.priority}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Drive Link</p>
                              {formData.drive_folder_url ? (
                                <a href={formData.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-[13px] font-bold hover:text-blue-800 flex items-center gap-1 transition-colors">
                                  <ExternalLink className="h-3.5 w-3.5" /> Open Drive
                                </a>
                              ) : (
                                <span className="text-slate-400 text-[13px] font-medium">Not provided</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 space-y-5 sm:space-y-6">
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                            <div>
                               <h4 className="text-[12px] sm:text-[13px] font-bold text-slate-800 uppercase tracking-wider">Client Details</h4>
                               <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 font-medium">Link project to a customer or internal node.</p>
                            </div>
                            <div className="flex bg-white rounded-lg sm:rounded-xl border border-slate-200 p-1 shadow-sm w-full sm:w-auto">
                              <button type="button" onClick={() => setCustomerType('existing')} className={`flex-1 sm:flex-none whitespace-nowrap px-3 sm:px-4 py-1.5 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-all ${customerType === 'existing' ? 'bg-gradient-to-r from-blue-900 to-indigo-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Existing</button>
                              <button type="button" onClick={() => setCustomerType('new')} className={`flex-1 sm:flex-none whitespace-nowrap px-3 sm:px-4 py-1.5 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-all ${customerType === 'new' ? 'bg-gradient-to-r from-blue-900 to-indigo-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>New</button>
                              <button type="button" onClick={() => setCustomerType('in_house')} className={`flex-1 sm:flex-none whitespace-nowrap px-3 sm:px-4 py-1.5 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-all ${customerType === 'in_house' ? 'bg-gradient-to-r from-blue-900 to-indigo-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>In-House</button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                            <div>
                              <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1">Owning Subsidiary</label>
                              {/* MODIFIED: This dropdown is firmly locked unless you are the Global Admin, forcing regular users to stay in their lane */}
                              <select value={formData.company_id} onChange={(e) => setFormData({...formData, company_id: e.target.value, customer_id: "", internal_company_id: "", assignee_ids: []})} disabled={!isGlobalAdmin} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-[13px] font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 shadow-sm cursor-pointer disabled:bg-slate-100 disabled:text-slate-400">
                                <option value="" disabled>Select Company...</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </div>

                            <div>
                              {customerType === 'existing' && (
                                <><label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1">Customer / Client *</label>
                                <select value={formData.customer_id} onChange={(e) => setFormData({...formData, customer_id: e.target.value, internal_company_id: ""})} disabled={!formData.company_id} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium outline-none focus:border-blue-500 shadow-sm disabled:bg-slate-100 disabled:text-slate-400">
                                  <option value="">-- Select Client --</option>
                                  {availableCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select></>
                              )}
                              {customerType === 'new' && (
                                <><label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1">New Client *</label>
                                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                  <input type="text" placeholder="Client Name *" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium outline-none focus:border-blue-500 shadow-sm disabled:bg-slate-100" />
                                  <input type="text" placeholder="Phone (Optional)" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium outline-none focus:border-blue-500 shadow-sm disabled:bg-slate-100" />
                                </div></>
                              )}
                              {customerType === 'in_house' && (
                                <><label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1">Internal Target *</label>
                                <select value={formData.internal_company_id} onChange={(e) => setFormData({...formData, internal_company_id: e.target.value, customer_id: ""})} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 bg-blue-50/50 px-3 sm:px-4 text-[12px] sm:text-[13px] font-bold text-blue-900 outline-none focus:border-blue-500 shadow-sm disabled:bg-slate-100 disabled:text-slate-400">
                                  <option value="">-- Select Own Company --</option>
                                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select></>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl sm:rounded-3xl p-4 sm:p-6">
                          <label className="text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1 flex items-center gap-1.5"><UploadCloud className="h-3.5 w-3.5" /> Secure Workspace Link (Google Drive)</label>
                          <input type="url" placeholder="https://drive.google.com/drive/folders/..." value={formData.drive_folder_url} onChange={(e) => setFormData({...formData, drive_folder_url: e.target.value})} className="w-full h-10 sm:h-12 rounded-xl border border-blue-200 bg-white px-3 sm:px-4 text-[12px] sm:text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 shadow-sm disabled:bg-slate-50" />

                          <div className="mt-3">
                            <button type="button" onClick={() => setShowDriveHelp(!showDriveHelp)} className="text-[10px] font-bold text-slate-500 hover:text-blue-600 uppercase tracking-wider flex items-center gap-1 transition-colors"><Info className="h-3.5 w-3.5" /> {showDriveHelp ? 'Hide Setup Guide' : 'How to set up the secure drive?'}</button>
                            <AnimatePresence>
                              {showDriveHelp && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                  <div className="mt-3 p-4 bg-white rounded-xl border border-blue-100 shadow-sm space-y-2 text-[11px] sm:text-xs text-slate-600 font-medium">
                                    <p><strong className="text-slate-800">Step 1:</strong> Create a new folder in your Google Drive named after this project.</p>
                                    <p><strong className="text-slate-800">Step 2:</strong> Right-click the folder → Share → General Access → Change to <strong>'Anyone with the link'</strong> (Set as Editor if they need to upload).</p>
                                    <p><strong className="text-slate-800">Step 3:</strong> Copy the link and paste it into the field above.</p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-5">
                          <div className={showFinance && role === 'admin' ? "md:col-span-3" : "md:col-span-4"}>
                            <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1 whitespace-nowrap truncate">Project Name</label>
                            <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 shadow-sm disabled:bg-slate-50" />
                          </div>
                          
                          {/* STRICT FINANCE ACCESS LOCK */}
                          {showFinance && role === 'admin' && (
                            <div className="flex flex-col">
                              <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1 whitespace-nowrap truncate">Expected Value (₹)</label>
                              <div className="flex gap-2 items-center">
                                <input type="number" value={formData.expected_amount} onChange={(e) => setFormData({...formData, expected_amount: parseFloat(e.target.value) || 0})} className="w-full h-10 sm:h-12 rounded-xl border border-emerald-200 bg-emerald-50 px-3 sm:px-4 text-[12px] sm:text-sm font-bold text-emerald-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 shadow-sm disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200" />
                                {selectedProject && (
                                  <button type="button" onClick={handleGenerateInvoice} disabled={isSaving} className="shrink-0 h-10 sm:h-12 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-[11px] font-bold shadow-md transition-all">
                                      Approve Invoice
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div>
                          {!showDescription && !formData.description ? (
                            <button type="button" onClick={() => setShowDescription(true)} className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider transition-colors px-1">
                              <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Add Project Description
                            </button>
                          ) : (
                            <div className="animate-in fade-in slide-in-from-top-2">
                              <div className="flex items-center justify-between mb-1.5 sm:mb-2 px-1">
                                <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</label>
                                <button type="button" onClick={() => { setShowDescription(false); setFormData({...formData, description: ""}); }} className="text-slate-400 hover:text-rose-500 transition-colors" title="Remove Description">
                                  <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                </button>
                              </div>
                              <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full h-20 sm:h-24 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 text-[12px] sm:text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 shadow-sm resize-none disabled:bg-slate-50" placeholder="Briefly describe the project goals or scope..." />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
                          <div><label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1">Priority</label><select value={formData.priority} onChange={(e) => setFormData({...formData, priority: e.target.value})} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-sm font-medium outline-none shadow-sm cursor-pointer disabled:bg-slate-50"><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option></select></div>
                          <div><label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1">Approval Date</label><input type="date" value={formData.approval_date} onChange={(e) => setFormData({...formData, approval_date: e.target.value})} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-sm font-medium outline-none shadow-sm disabled:bg-slate-50" /></div>
                          <div><label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 sm:mb-2 px-1">Due Date</label><input type="date" value={formData.due_date} onChange={(e) => setFormData({...formData, due_date: e.target.value})} className="w-full h-10 sm:h-12 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-[12px] sm:text-sm font-medium outline-none shadow-sm disabled:bg-slate-50" /></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: TEAM ASSIGNMENT WIZARD */}
                {modalTab === 'team' && (
                  <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-5 sm:p-8 flex flex-col sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar-thumb]:bg-slate-300 sm:[&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar-track]:bg-transparent max-sm:[&::-webkit-scrollbar]:hidden max-sm:[-ms-overflow-style:none] max-sm:[scrollbar-width:none]">
                     <div className="pt-2">
                        <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 sm:mb-3 px-1">Assign Team Members to Project</label>
                        <div className="flex flex-wrap gap-2 sm:gap-2.5">
                          {availableEmployees.length === 0 ? <p className="text-xs text-slate-400 italic">No available employees to assign.</p> : null}
                          {availableEmployees.map(emp => {
                            const isSelected = formData.assignee_ids.includes(emp.id);
                            return (
                              <button key={emp.id} onClick={() => { if (isSelected) setFormData({...formData, assignee_ids: formData.assignee_ids.filter(id => id !== emp.id)}); else setFormData({...formData, assignee_ids: [...formData.assignee_ids, emp.id]}); }} className={`flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl border text-[11px] sm:text-xs font-bold transition-all shadow-sm ${isSelected ? 'bg-gradient-to-r from-blue-900 to-indigo-800 text-white border-transparent' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}>
                                 {emp.profile_image_url ? <img src={emp.profile_image_url} alt="" className="h-4 w-4 sm:h-5 sm:w-5 rounded-full object-cover shadow-sm" /> : <User className="h-3 w-3 sm:h-4 sm:w-4 text-slate-400" />} {emp.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {isUserView && (
                        <div className="pt-6 border-t border-slate-200 mt-6">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Project Team Members</p>
                          <div className="flex flex-wrap gap-2.5">
                            {formData.assignee_ids.length === 0 ? <p className="text-xs text-slate-400 italic">No assigned team members.</p> : null}
                            {formData.assignee_ids.map(id => {
                              const emp = getAvatar(id);
                              return (
                                <div key={id} className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-full border border-slate-200 shadow-sm">
                                  {emp?.profile_image_url ? (
                                    <img src={emp.profile_image_url} className="h-5 w-5 sm:h-6 sm:w-6 rounded-full object-cover" alt="" />
                                  ) : (
                                    <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500">{emp?.name.charAt(0)}</div>
                                  )}
                                  <span className="text-[11px] sm:text-xs font-bold text-slate-700">{emp?.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {/* TAB 3: TASKS PANEL */}
                {modalTab === 'tasks' && (
                  <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-5 sm:p-8 flex flex-col sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar-thumb]:bg-slate-300 sm:[&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar-track]:bg-transparent max-sm:[&::-webkit-scrollbar]:hidden max-sm:[-ms-overflow-style:none] max-sm:[scrollbar-width:none]">
                    <div className="w-full flex flex-col h-full gap-5 sm:gap-6">

                      {isAdminView && (
                        <div className="flex flex-col xl:flex-row gap-3 shrink-0">
                          <input 
                            type="text" 
                            placeholder="New task title..." 
                            value={newTaskTitle} 
                            onChange={(e) => setNewTaskTitle(e.target.value)} 
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (newTaskTitle.trim() !== "" && newTaskAssignee !== "" && newTaskDeadline !== "") handleAddTask();
                              }
                            }} 
                            className="flex-1 h-10 sm:h-12 rounded-xl border border-slate-200 px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium outline-none focus:border-blue-500 shadow-sm bg-white" 
                          />
                          <div className="flex gap-2 sm:gap-3 w-full xl:w-auto">
                            <input 
                              type="date" 
                              title="Task Deadline" 
                              value={newTaskDeadline} 
                              max={formData.due_date || undefined}
                              onChange={(e) => {
                                if (formData.due_date && new Date(e.target.value) > new Date(formData.due_date)) {
                                  alert(`Task deadline cannot exceed the project's main due date (${formData.due_date}).`);
                                  return;
                                }
                                setNewTaskDeadline(e.target.value);
                              }} 
                              className="w-full sm:w-36 h-10 sm:h-12 rounded-xl border border-slate-200 px-2 sm:px-3 text-[11px] sm:text-[13px] font-medium outline-none shadow-sm bg-white" 
                            />
                            <select 
                              value={newTaskAssignee} 
                              onChange={(e) => setNewTaskAssignee(parseInt(e.target.value) || "")} 
                              className="w-full sm:w-40 h-10 sm:h-12 rounded-xl border border-slate-200 px-2 sm:px-3 text-[11px] sm:text-[13px] font-medium outline-none bg-white shadow-sm cursor-pointer"
                            >
                              <option value="" disabled>-- Select Person --</option>
                              {(formData.assignee_ids || []).map(id => <option key={id} value={id}>{getAvatar(id)?.name || 'Unknown'}</option>)}
                            </select>

                            <AnimatePresence>
                              {newTaskTitle.trim() !== "" && newTaskAssignee !== "" && newTaskDeadline !== "" && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.5, width: 0, marginLeft: -12 }}
                                  animate={{ opacity: 1, scale: 1, width: 'auto', marginLeft: 0 }}
                                  exit={{ opacity: 0, scale: 0.5, width: 0, marginLeft: -12 }}
                                  className="shrink-0 overflow-hidden flex items-center"
                                >
                                  <button onClick={handleAddTask} className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl flex items-center justify-center font-bold shadow-md hover:shadow-lg transition-all">
                                    <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      )}

                      <div className="flex-1 overflow-y-auto space-y-2 sm:space-y-3 pr-2 min-h-0 sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar-thumb]:bg-slate-300 sm:[&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar-track]:bg-transparent max-sm:[&::-webkit-scrollbar]:hidden max-sm:[-ms-overflow-style:none] max-sm:[scrollbar-width:none]">
                        {displayTasks.length === 0 ? (
                          <div className="h-32 sm:h-40 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl sm:rounded-3xl border border-dashed border-slate-200">
                            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">No tasks added</p>
                          </div>
                        ) : (
                          displayTasks.map((task, index) => {
                            const deadlineStat = !task.is_completed ? getDueDateStatus(task.deadline) : null;
                            const isMyTask = task.assignee_id === employeeId || !task.assignee_id;

                            return (
                              <div key={task.id || index} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all ${task.is_completed ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200 hover:border-blue-200 shadow-sm'}`}>
                                <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
                                  <div onClick={() => isAdminView ? handleAdminToggleTask(task, index) : null} className={`mt-0.5 h-4 w-4 sm:h-5 sm:w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${isAdminView ? 'cursor-pointer' : 'opacity-70'} ${task.is_completed ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`}>
                                    {task.is_completed && <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-[12px] sm:text-[13px] font-bold leading-relaxed break-words ${task.is_completed ? 'text-slate-500' : 'text-slate-700'}`}>{task.title}</p>
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5">
                                      {task.assignee_id && <span className="text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase tracking-wider truncate">{getAvatar(task.assignee_id)?.name}</span>}

                                      {isAdminView ? (
                                        <input 
                                          type="date" 
                                          title="Edit Deadline"
                                          value={task.deadline || ''} 
                                          max={formData.due_date || undefined}
                                          onChange={(e) => handleUpdateTaskDeadline(task, index, e.target.value)} 
                                          className="h-6 sm:h-7 rounded-md border border-slate-200 px-2 text-[9px] sm:text-[10px] font-bold text-slate-600 bg-white hover:bg-slate-50 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
                                        />
                                      ) : (
                                        deadlineStat && (
                                          <span className={`flex items-center gap-1 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${deadlineStat.style}`}>
                                            <div className={`h-1.5 w-1.5 rounded-full ${deadlineStat.dot}`} /> {deadlineStat.label}
                                          </span>
                                        )
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {isUserView && isMyTask && (
                                  <button onClick={() => { setTaskToUpload(task); setIsUploadModalOpen(true); }} className={`shrink-0 w-full sm:w-auto h-9 sm:h-10 rounded-lg px-4 flex items-center justify-center gap-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider shadow-sm transition-colors ${task.is_completed ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                                    <UploadCloud className="h-3.5 w-3.5" /> {task.is_completed ? 'Add More Files' : 'Upload Work'}
                                  </button>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>

                    </div>
                  </div>
                )}

                {/* TAB 4: TIMELINE & MILESTONES */}
                {modalTab === 'progress' && (
                  <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-5 sm:p-8 flex flex-col sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar-thumb]:bg-slate-300 sm:[&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar-track]:bg-transparent max-sm:[&::-webkit-scrollbar]:hidden max-sm:[-ms-overflow-style:none] max-sm:[scrollbar-width:none]">

                    {isAdminView && (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6 mb-6 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <div>
                            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Project Milestones</h4>
                            <p className="text-[11px] text-slate-500 mt-1">Check prerequisites to automatically level up project status.</p>
                          </div>
                          <div className={`px-4 py-1.5 rounded-xl text-xs font-bold shadow-sm uppercase tracking-wider border ${getStatusStyle(formData.status)}`}>
                            {formData.status}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b pb-2">To "In Progress"</h5>
                            <div className="space-y-2">
                              {Object.entries({ drive_created: "Drive Folder Created", team_briefed: "Team Briefed", budget_cleared: "Budget Cleared" }).map(([key, label]) => (
                                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                                  <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${formData.milestones?.in_progress?.[key as keyof typeof formData.milestones.in_progress] ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                                    {formData.milestones?.in_progress?.[key as keyof typeof formData.milestones.in_progress] && <Check className="h-3.5 w-3.5 text-white" />}
                                  </div>
                                  <span className={`text-xs font-semibold ${formData.milestones?.in_progress?.[key as keyof typeof formData.milestones.in_progress] ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{label}</span>
                                  <input type="checkbox" className="hidden" checked={!!formData.milestones?.in_progress?.[key as keyof typeof formData.milestones.in_progress]} onChange={() => handleMilestoneToggle('in_progress', key)} />
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm opacity-90 hover:opacity-100 transition-opacity">
                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b pb-2">To "Review"</h5>
                            <div className="space-y-2">
                              {Object.entries({ all_tasks_done: "All Tasks Completed", internal_qa: "Internal QA Passed" }).map(([key, label]) => (
                                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                                  <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${formData.milestones?.review?.[key as keyof typeof formData.milestones.review] ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                                    {formData.milestones?.review?.[key as keyof typeof formData.milestones.review] && <Check className="h-3.5 w-3.5 text-white" />}
                                  </div>
                                  <span className={`text-xs font-semibold ${formData.milestones?.review?.[key as keyof typeof formData.milestones.review] ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{label}</span>
                                  <input type="checkbox" className="hidden" checked={!!formData.milestones?.review?.[key as keyof typeof formData.milestones.review]} onChange={() => handleMilestoneToggle('review', key)} />
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm opacity-90 hover:opacity-100 transition-opacity">
                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b pb-2">To "Completed"</h5>
                            <div className="space-y-2">
                              {Object.entries({ client_approved: "Client Approved", final_handover: "Final Handover" }).map(([key, label]) => (
                                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                                  <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${formData.milestones?.completed?.[key as keyof typeof formData.milestones.completed] ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                                    {formData.milestones?.completed?.[key as keyof typeof formData.milestones.completed] && <Check className="h-3.5 w-3.5 text-white" />}
                                  </div>
                                  <span className={`text-xs font-semibold ${formData.milestones?.completed?.[key as keyof typeof formData.milestones.completed] ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{label}</span>
                                  <input type="checkbox" className="hidden" checked={!!formData.milestones?.completed?.[key as keyof typeof formData.milestones.completed]} onChange={() => handleMilestoneToggle('completed', key)} />
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="w-full flex flex-col h-full gap-6">
                       {isUserView ? (
                         <>
                           <div className="flex flex-col shrink-0">
                             <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 sm:mb-3">Add New Log Entry</p>
                             <textarea value={myReportText} onChange={e => setMyReportText(e.target.value)} placeholder="Type your latest progress update here..." className="w-full h-20 sm:h-24 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 text-[12px] sm:text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all resize-none mb-3 sm:mb-4 shadow-sm" />
                             <div className="flex justify-end">
                               <button onClick={handleSaveMyReport} disabled={isSaving} className="w-full sm:w-auto bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl h-10 sm:h-11 px-6 sm:px-8 text-[12px] sm:text-sm font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
                                 {isSaving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Submit Update"}
                               </button>
                             </div>
                           </div>

                           <div className="flex-1 overflow-y-auto min-h-0 pt-5 sm:pt-6 border-t border-slate-100">
                             <h4 className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 sm:mb-4">My Previous Updates</h4>

                             <div className="space-y-4">
                               {myEntries.map((entry: any) => {
                                 const isEditing = editingEntryId === entry.id;
                                 const hasReaction = !!entry.reaction;
                                 const visual = getReactionVisuals(entry.reaction?.status);

                                 return (
                                   <div key={entry.id} className="relative">
                                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative group transition-all hover:border-slate-300 z-10">
                                         {!isEditing && (
                                            <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                               <button onClick={() => { setEditingEntryId(entry.id); setEditingEntryText(entry.text); }} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-md transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                                               <button onClick={() => handleDeleteEntry(employeeId, entry.id)} className="p-1.5 text-slate-400 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                                            </div>
                                         )}

                                         {entry.type === 'upload' && (
                                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-bold uppercase tracking-wider rounded-lg mb-3">
                                              <FileText className="h-3 w-3" /> Attached File: {entry.task_title}
                                           </span>
                                         )}

                                         {isEditing ? (
                                            <div className="mt-1">
                                               <textarea value={editingEntryText} onChange={e => setEditingEntryText(e.target.value)} className="w-full h-20 rounded-xl border border-blue-200 bg-blue-50/30 p-3 text-[12px] sm:text-[13px] outline-none focus:border-blue-500 mb-2 resize-none" />
                                               <div className="flex justify-end gap-2">
                                                  <button onClick={() => setEditingEntryId(null)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-100 uppercase tracking-wider">Cancel</button>
                                                  <button onClick={() => handleEditUserEntry(entry.id)} disabled={isSaving} className="px-4 py-1.5 rounded-lg text-[10px] font-bold bg-blue-600 text-white uppercase tracking-wider hover:bg-blue-700 shadow-sm">{isSaving ? 'Saving...' : 'Save'}</button>
                                               </div>
                                            </div>
                                         ) : (
                                            <p className="text-[13px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed pr-16">{entry.text}</p>
                                         )}
                                         <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-3 block">{new Date(entry.timestamp).toLocaleString()}</span>
                                      </div>

                                      {hasReaction && (
                                         <div className="ml-6 sm:ml-10 mt-2 relative">
                                            <CornerDownRight className="absolute -left-5 top-3 h-4 w-4 text-slate-300" />
                                            <div className={`p-3.5 rounded-xl border ${visual.bg} ${visual.border}`}>
                                               <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${visual.text} mb-1`}>
                                                  <visual.icon className="h-3.5 w-3.5" /> {entry.reaction.status}
                                               </span>
                                               {entry.reaction.text && <p className={`text-xs ${visual.text} opacity-90`}>{entry.reaction.text}</p>}
                                            </div>
                                         </div>
                                      )}
                                   </div>
                                 )
                               })}

                               {myReport?.report_text && myEntries.length === 0 && (
                                 <pre className="text-[12px] sm:text-[13px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
                                   {myReport.report_text}
                                 </pre>
                               )}

                               {myEntries.length === 0 && !myReport?.report_text && (
                                 <p className="text-[12px] sm:text-sm italic text-slate-400 py-6">No updates submitted yet.</p>
                               )}
                             </div>
                           </div>
                         </>
                       ) : (
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                           {(formData.assignee_ids || []).length === 0 && <p className="text-[12px] sm:text-sm text-slate-400 italic md:col-span-2">No team members assigned.</p>}

                           {(formData.assignee_ids || []).map(empId => {
                             const emp = getAvatar(empId);
                             const empReport = reports.find(r => r.project_id === selectedProject?.id && r.employee_id === empId);
                             
                             const noteCount = Array.isArray(empReport?.entries) ? empReport.entries.length : 0;

                             return (
                               <div key={empId} className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-5 shadow-sm flex flex-col items-center text-center transition-all group">
                                 <div className="h-12 w-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 overflow-hidden shrink-0 mb-3 shadow-sm">
                                    {emp?.profile_image_url ? <img src={emp.profile_image_url} alt="" className="h-full w-full object-cover" /> : (emp?.name || 'U').charAt(0).toUpperCase()}
                                 </div>
                                 <p className="text-[14px] sm:text-base font-black text-slate-900 tracking-tight">{emp?.name}</p>
                                 <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1 mb-4">{noteCount} Updates Logged</p>

                                 <button onClick={() => setTimelineModalEmpId(empId)} className="w-full py-2.5 rounded-xl bg-slate-50 text-slate-700 text-[11px] font-bold uppercase tracking-wider border border-slate-200 group-hover:bg-blue-50 group-hover:text-blue-700 group-hover:border-blue-200 transition-colors">
                                   View Timeline
                                 </button>
                               </div>
                             )
                           })}
                         </div>
                       )}
                    </div>
                  </div>
                )}

                {/* TAB 5: FINANCIALS (STRICTLY LOCKED) */}
                {modalTab === 'finance' && showFinance && (
                  <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-5 sm:p-8 flex flex-col sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar-thumb]:bg-slate-300 sm:[&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar-track]:bg-transparent max-sm:[&::-webkit-scrollbar]:hidden max-sm:[-ms-overflow-style:none] max-sm:[scrollbar-width:none]">
                    <div className="w-full flex flex-col h-full gap-4 sm:gap-5">

                      {isUserView ? (
                         <div className="w-full max-w-2xl mx-auto bg-white border border-slate-100 rounded-3xl p-6 sm:p-10 shadow-sm flex flex-col items-center">
                            <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
                               <div className="bg-slate-50 border border-slate-100 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-center">
                                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Earned</p>
                                  <p className="text-xl sm:text-2xl font-black text-emerald-600">₹{userTotalAllocated.toLocaleString()}</p>
                               </div>
                               <div className="bg-slate-50 border border-slate-100 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-center">
                                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Payments Rec'd</p>
                                  <p className="text-xl sm:text-2xl font-black text-slate-800">₹{userTotalEarned.toLocaleString()}</p>
                               </div>
                               <div className="bg-slate-50 border border-slate-100 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-center">
                                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Balance Due</p>
                                  <p className="text-xl sm:text-2xl font-black text-rose-500">₹{userBalanceDue.toLocaleString()}</p>
                               </div>
                            </div>

                            <button onClick={handlePrintPayslip} disabled={isPrintingPayslip} className="bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl h-12 sm:h-14 px-6 sm:px-10 text-[12px] sm:text-sm font-bold shadow-xl shadow-blue-900/20 hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center gap-2">
                               <Download className="h-4 w-4 sm:h-5 sm:w-5" /> Download PDF Payslip
                            </button>
                         </div>
                      ) : (
                         <>
                            <div className="flex justify-end shrink-0">
                               <button 
                                  onClick={() => setShowPayoutForm(!showPayoutForm)} 
                                  className={`px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${showPayoutForm ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'}`}
                               >
                                  {showPayoutForm ? <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />} 
                                  {showPayoutForm ? "Close Payout" : "Issue Payout"}
                               </button>
                            </div>

                            <AnimatePresence>
                               {showPayoutForm && (
                                 <motion.div 
                                    initial={{ height: 0, opacity: 0 }} 
                                    animate={{ height: 'auto', opacity: 1 }} 
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden shrink-0"
                                 >
                                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-2">
                                       <h4 className="text-[12px] sm:text-sm font-bold text-emerald-800 uppercase tracking-widest mb-4 sm:mb-5">Issue Payout / Advance</h4>
                                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                                          <div className="lg:col-span-1">
                                            <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1.5 px-1">Employee</label>
                                            <select value={paymentForm.employee_id} onChange={e => setPaymentForm({...paymentForm, employee_id: e.target.value})} className="w-full h-10 sm:h-11 rounded-xl border border-emerald-200 bg-white px-3 text-[12px] sm:text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 shadow-sm cursor-pointer"><option value="">-- Select --</option>{(formData.assignee_ids || []).map(id => <option key={id} value={id}>{getAvatar(id)?.name}</option>)}</select>
                                          </div>
                                          <div className="lg:col-span-1">
                                            <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1.5 px-1">Amount (₹)</label>
                                            <input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value)||0})} className="w-full h-10 sm:h-11 rounded-xl border border-emerald-200 bg-white px-3 text-[12px] sm:text-sm font-black text-emerald-700 outline-none focus:border-emerald-500 shadow-sm min-w-0" />
                                          </div>
                                          <div className="lg:col-span-1">
                                            <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1.5 px-1">Type</label>
                                            <select value={paymentForm.payment_type} onChange={e => setPaymentForm({...paymentForm, payment_type: e.target.value})} className="w-full h-10 sm:h-11 rounded-xl border border-emerald-200 bg-white px-3 text-[12px] sm:text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 shadow-sm cursor-pointer"><option>Advance</option><option>Final Payout</option><option>Incentive / Bonus</option></select>
                                          </div>
                                          <div className="lg:col-span-2">
                                            <label className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase block mb-1.5 px-1">Notes (Optional)</label>
                                            <div className="flex gap-2">
                                              <input type="text" placeholder="Ref or details..." value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} className="flex-1 h-10 sm:h-11 rounded-xl border border-emerald-200 bg-white px-3 text-[12px] sm:text-sm font-medium outline-none focus:border-emerald-500 shadow-sm min-w-0" />
                                              <button onClick={handleRecordProjectPayment} disabled={isSaving} className="h-10 sm:h-11 px-4 sm:px-6 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-[11px] sm:text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all shrink-0">Transfer</button>
                                            </div>
                                          </div>
                                       </div>
                                    </div>
                                 </motion.div>
                               )}
                            </AnimatePresence>

                            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col flex-1 min-h-0 relative">
                               <div className="w-full h-full overflow-y-auto sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar-thumb]:bg-slate-300 sm:[&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar-track]:bg-transparent max-sm:[&::-webkit-scrollbar]:hidden max-sm:[-ms-overflow-style:none max-sm:[scrollbar-width:none]">
                                 <div className="grid grid-cols-12 gap-2 sm:gap-4 bg-slate-50 px-3 sm:px-6 py-3 border-b border-slate-100 text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center sticky top-0 z-10">
                                    <div className="col-span-2 text-left">Team Member</div>
                                    <div className="col-span-2 text-emerald-600">Paid (₹)</div>
                                    <div className="col-span-2">Allocated</div>
                                    <div className="col-span-2">Bonus</div>
                                    <div className="col-span-2">Total</div>
                                    <div className="col-span-2 text-right">Balance Due</div>
                                 </div>

                                 {(formData.assignee_ids || []).length === 0 && <p className="text-[12px] sm:text-sm text-center text-slate-400 italic py-6 sm:py-8">No team members assigned.</p>}

                                 <div className="flex flex-col pb-16">
                                    {(formData.assignee_ids || []).map(empId => {
                                       const emp = getAvatar(empId);
                                       const alloc = allocationsForm[empId] || {allocated: 0, incentive: 0};
                                       const empPaid = salaryPayments.filter(sp => sp.project_id === selectedProject.id && sp.employee_id === empId).reduce((sum, sp) => sum + parseFloat(sp.amount || 0), 0);
                                       const empPaymentsList = salaryPayments.filter(sp => sp.project_id === selectedProject.id && sp.employee_id === empId);
                                       const lineTotal = alloc.allocated + alloc.incentive;
                                       const empBalance = lineTotal - empPaid;
                                       const isExpanded = expandedFinanceEmpId === empId;

                                       return (
                                         <div key={empId} className="flex flex-col border-b border-slate-50 hover:bg-slate-50/50 transition-colors last:border-none">
                                            <div 
                                               className="grid grid-cols-12 gap-2 sm:gap-4 items-center px-3 sm:px-6 py-3 cursor-pointer group"
                                               onClick={() => setExpandedFinanceEmpId(isExpanded ? null : empId)}
                                            >
                                               <div className="col-span-2 flex items-center gap-1.5 sm:gap-3 min-w-0 relative">
                                                 <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-slate-100 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-slate-600 overflow-hidden shadow-sm shrink-0">{emp?.profile_image_url ? <img src={emp.profile_image_url} alt="" className="h-full w-full object-cover" /> : (emp?.name || 'U').charAt(0).toUpperCase()}</div>
                                                 <span className="text-[10px] sm:text-[12px] font-bold text-slate-900 truncate">{emp?.name}</span>
                                                 <ChevronDown className={`absolute -left-3 sm:-left-4 text-slate-300 h-3 w-3 sm:h-4 sm:w-4 transition-transform ${isExpanded ? 'rotate-180' : 'opacity-0 group-hover:opacity-100'}`} />
                                               </div>

                                               <div className="col-span-2 text-[10px] sm:text-[13px] font-bold text-emerald-600 text-center truncate">
                                                  ₹{empPaid.toLocaleString()}
                                               </div>

                                               <div className="col-span-2" onClick={e => e.stopPropagation()}>
                                                  <input type="number" value={alloc.allocated} onChange={e => setAllocationsForm({...allocationsForm, [empId]: {...alloc, allocated: parseFloat(e.target.value)||0}})} className="w-full h-8 sm:h-10 border border-slate-200 rounded-md sm:rounded-xl px-1 sm:px-3 font-bold text-[10px] sm:text-[13px] outline-none focus:border-blue-500 transition-all text-center min-w-0 bg-white" />
                                               </div>

                                               <div className="col-span-2" onClick={e => e.stopPropagation()}>
                                                  <input type="number" value={alloc.incentive} onChange={e => setAllocationsForm({...allocationsForm, [empId]: {...alloc, incentive: parseFloat(e.target.value)||0}})} className="w-full h-8 sm:h-10 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-md sm:rounded-xl px-1 sm:px-3 font-bold text-[10px] sm:text-[13px] outline-none focus:border-emerald-500 transition-all text-center min-w-0" />
                                               </div>

                                               <div className="col-span-2 text-[10px] sm:text-[13px] font-bold text-slate-700 text-center truncate">
                                                  ₹{lineTotal.toLocaleString()}
                                               </div>

                                               <div className="col-span-2 text-right text-[11px] sm:text-[14px] font-black text-slate-900 truncate">
                                                  ₹{empBalance.toLocaleString()}
                                               </div>
                                            </div>

                                            <AnimatePresence>
                                               {isExpanded && (
                                                 <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-slate-50/50">
                                                    <div className="px-4 sm:px-12 py-3 sm:py-4">
                                                       <h5 className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 sm:mb-3">Transaction History</h5>
                                                       {empPaymentsList.length === 0 ? (
                                                          <p className="text-[10px] sm:text-[11px] text-slate-500 italic">No payments recorded for this member yet.</p>
                                                       ) : (
                                                          <div className="space-y-1.5 sm:space-y-2">
                                                             {empPaymentsList.map(p => (
                                                                <div key={p.id} className="flex justify-between items-center text-[10px] sm:text-[12px] bg-white border border-slate-100 p-2 sm:p-2.5 rounded-lg shadow-sm">
                                                                   <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                                                      <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500 shrink-0" />
                                                                      <div className="truncate">
                                                                         <span className="font-bold text-slate-700 mr-2">{new Date(p.payment_date).toLocaleDateString()}</span>
                                                                         <span className="text-slate-500 truncate">({p.payment_type}){p.notes && ` - ${p.notes}`}</span>
                                                                      </div>
                                                                   </div>
                                                                   <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                                                                      <span className="font-black text-emerald-600">+ ₹{parseFloat(p.amount).toLocaleString()}</span>
                                                                      {(role === 'admin' || role === 'head') && (
                                                                         <button onClick={(e) => { e.stopPropagation(); handleDeleteProjectPayment(p.id); }} className="text-rose-400 hover:text-rose-600 p-1 bg-rose-50 rounded-md transition-colors"><Trash2 className="h-3 w-3 sm:h-3.5 w-3.5" /></button>
                                                                      )}
                                                                   </div>
                                                                </div>
                                                             ))}
                                                          </div>
                                                       )}
                                                    </div>
                                                 </motion.div>
                                               )}
                                            </AnimatePresence>

                                         </div>
                                       )
                                    })}
                                 </div>
                               </div>

                               {hasAllocationChanges && (
                                 <div className="absolute bottom-0 left-0 right-0 bg-slate-50/90 backdrop-blur-md px-4 sm:px-6 py-3 border-t border-slate-200 flex justify-end shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <button onClick={handleSaveAllocations} disabled={isSaving} className="bg-gradient-to-r from-blue-900 to-indigo-800 text-white hover:shadow-lg hover:-translate-y-0.5 rounded-lg sm:rounded-xl h-9 sm:h-10 px-4 sm:px-6 text-[11px] sm:text-xs font-bold shadow-sm transition-all flex items-center">
                                       {isSaving ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Saving...</> : "Save Allocations"}
                                    </button>
                                 </div>
                               )}
                            </div>
                         </>
                      )}
                    </div>
                  </div>
                )}

                {/* MODIFIED: Modal Footer - Fixed Cancel Button Position next to Save */}
                <div className="p-4 sm:p-6 border-t border-slate-100 bg-[#FAFCFF] flex justify-end items-center gap-3 shrink-0 mt-auto">
                  {selectedProject && isAdminView && modalTab === 'details' && (
                    <button onClick={handleDeleteProject} disabled={isSaving} className="border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 rounded-xl h-10 sm:h-12 px-3 sm:px-5 flex items-center justify-center shadow-sm mr-auto transition-colors shrink-0"><Trash2 className="h-4 w-4" /></button>
                  )}

                  <button onClick={() => setIsModalOpen(false)} className="rounded-xl border border-slate-200 bg-white h-10 sm:h-12 px-4 sm:px-8 font-bold text-[12px] sm:text-sm text-slate-600 hover:bg-slate-50 shadow-sm transition-colors flex-1 sm:flex-none">Cancel</button>

                  {isAdminView && (
                    <>
                      {!selectedProject && modalTab === 'details' && (
                        <button onClick={() => setModalTab('team')} className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl h-10 sm:h-12 px-6 sm:px-10 font-bold text-[12px] sm:text-sm shadow-md transition-all flex-1 sm:flex-none flex items-center justify-center">
                          Next: Assign Team
                        </button>
                      )}
                      {!selectedProject && modalTab === 'team' && (
                        <button onClick={() => setModalTab('tasks')} className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl h-10 sm:h-12 px-6 sm:px-10 font-bold text-[12px] sm:text-sm shadow-md transition-all flex-1 sm:flex-none flex items-center justify-center">
                          Next: Action Items
                        </button>
                      )}
                      {!selectedProject && modalTab === 'tasks' && (
                        <button onClick={handleSaveProject} disabled={isSaving} className="bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl h-10 sm:h-12 px-6 sm:px-10 font-bold text-[12px] sm:text-sm shadow-md shadow-blue-900/20 hover:shadow-lg hover:-translate-y-0.5 transition-all flex-1 sm:flex-none flex items-center justify-center">
                          {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Finish & Create Project"}
                        </button>
                      )}
                      {selectedProject && (
                        <button onClick={handleSaveProject} disabled={isSaving} className="bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl h-10 sm:h-12 px-6 sm:px-10 font-bold text-[12px] sm:text-sm shadow-md shadow-blue-900/20 hover:shadow-lg hover:-translate-y-0.5 transition-all flex-1 sm:flex-none flex items-center justify-center">
                          {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Save Changes"}
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