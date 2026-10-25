import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, Search, FolderKanban, CheckCircle2, AlertCircle, X, Check, User, Trash2, Clock, Download, Loader2, ChevronDown, ExternalLink, UploadCloud, Calendar, Info, Layers, FileText, Edit2, ThumbsUp, ThumbsDown, Eye, MessageCircle, CornerDownRight, BookOpen, ListTodo, MessageSquare, LayoutGrid, List, MoreVertical, ChevronLeft, ChevronRight, Receipt, Settings, Users, Activity, CreditCard, Globe, Code, FileVideo, Briefcase, Zap, PieChart } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import { useDataStore } from "../../../store/dataStore";
import { supabase } from "../../../supabase";

const STATUS_OPTIONS = ['Planning', 'In Progress', 'Review', 'Completed'];

const DEFAULT_MILESTONES = {
  in_progress: { drive_created: false, team_briefed: false, budget_cleared: false },
  review: { all_tasks_done: false, internal_qa: false },
  completed: { client_approved: false, final_handover: false }
};

const RESOURCE_TYPES = [
  { id: 'drive', label: 'Google Drive', icon: FolderKanban, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  { id: 'figma', label: 'Figma / Design', icon: Edit2, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  { id: 'github', label: 'GitHub / Code', icon: Code, color: 'text-gray-800', bg: 'bg-gray-100 border-gray-300' },
  { id: 'video', label: 'Video / Media', icon: FileVideo, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  { id: 'website', label: 'Website / Link', icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
];

export default function StandardProjects({ autoOpenProjectId, forcedCompanyId, onClearOverride, onCrossHandoff }: { autoOpenProjectId?: number | null, forcedCompanyId?: number | null, onClearOverride?: () => void, onCrossHandoff?: (projectId: number, compId: number) => void }) {
  const { role, employeeId, activeWorkspace, companyId } = useAuthStore();
  const store = useDataStore();
  const { projects, tasks, reports, employees, companies, customers, salaryPayments, projectAllocations, invoices, fetchAllData, targetProjectId, setTargetProjectId } = store;
  const location = useLocation();
  const navigate = useNavigate();

  const [projectTab, setProjectTab] = useState<'all' | 'pending_billing'>('all');
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");
  const [sortOption, setSortOption] = useState<"newest" | "due_date_asc" | "due_date_desc">("newest");
  const [layoutView, setLayoutView] = useState<'grid' | 'list'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInstantOpen, setIsInstantOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"details" | "team" | "tasks" | "progress" | "opex" | "finance">("details");
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'admin' | 'user'>('admin');
  const [roleSelectProject, setRoleSelectProject] = useState<any>(null);

  const isImpersonating = role === 'admin' && activeWorkspace !== null;
  const isGlobalAdmin = role === 'admin' && !isImpersonating;
  const isHead = role === 'head' || isImpersonating;
  const isUserView = role === 'user' || viewMode === 'user';
  const isAdminView = (isGlobalAdmin || isHead) && viewMode === 'admin';
  const currentCompanyId = forcedCompanyId ? forcedCompanyId.toString() : (isGlobalAdmin ? "" : (activeWorkspace || companyId));

  const [expandedFinanceEmpId, setExpandedFinanceEmpId] = useState<number | null>(null);
  const [showDescription, setShowDescription] = useState(false); 

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [taskToUpload, setTaskToUpload] = useState<any>(null);
  const [uploadNote, setUploadNote] = useState(""); 

  const [timelineModalEmpId, setTimelineModalEmpId] = useState<number | null>(null);
  const [taskRedirectPrompt, setTaskRedirectPrompt] = useState<any>(null);
  
  const [customAlert, setCustomAlert] = useState<{title: string, message: string, type: 'error' | 'success' | 'info'} | null>(null);
  const [confirmAction, setConfirmAction] = useState<{title: string, message: string, action: () => void} | null>(null);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);

  const [reactionFormId, setReactionFormId] = useState<string | null>(null);
  const [reactionText, setReactionText] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryText, setEditingEntryText] = useState("");

  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({ 
    name: "", description: "", priority: "Medium", status: "Planning", expected_amount: 0, 
    approval_date: today, due_date: "", company_id: "", customer_id: "", internal_company_id: "", 
    resource_links: [] as {id: string, title: string, url: string, type: string}[],
    assignee_ids: [] as number[], milestones: DEFAULT_MILESTONES
  });

  const [customerType, setCustomerType] = useState<"existing" | "new" | "in_house">("existing");
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [newResource, setNewResource] = useState({ title: "", url: "", type: "website" });
  const [showResourceForm, setShowResourceForm] = useState(false);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState<number | "">("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [editingTaskKey, setEditingTaskKey] = useState<string | number | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ title: "", assignee_id: "", deadline: "" });

  const [myReportText, setMyReportText] = useState("");
  const [isPrintingPayslip, setIsPrintingPayslip] = useState(false);

  const [allocationsForm, setAllocationsForm] = useState<{[empId: number]: {allocated: number, incentive: number}}>({});
  const [paymentForm, setPaymentForm] = useState({ employee_id: "", amount: 0, payment_type: "Advance", notes: "" });
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editPaymentForm, setEditPaymentForm] = useState({ amount: 0, payment_type: "Standard" });

  const [projectExpenses, setProjectExpenses] = useState<any[]>([]);
  const [newExpense, setNewExpense] = useState({ category: "Software & Tools", description: "", amount: 0 });

  const currentCompany = companies.find((c: any) => c.id?.toString() === currentCompanyId?.toString());
  const showFinance = role === 'admin' || (role === 'head' && currentCompany?.allow_head_finance !== false);

  const myReport = selectedProject ? reports.find(r => r.project_id?.toString() === selectedProject.id?.toString() && r.employee_id?.toString() === employeeId?.toString()) : null;
  const myEntries = Array.isArray(myReport?.entries) ? myReport.entries : [];
  const adminTimelineReport = (selectedProject && timelineModalEmpId) ? reports.find(r => r.project_id?.toString() === selectedProject.id?.toString() && r.employee_id?.toString() === timelineModalEmpId?.toString()) : null;
  const adminTimelineEntries = Array.isArray(adminTimelineReport?.entries) ? adminTimelineReport.entries : [];

  const taskSnapshot = (stagedTasks: any) => stagedTasks.map((t: any) => ({ id: t.id, title: t.title, assignee_id: t.assignee_id, deadline: t.deadline, is_completed: t.is_completed }));
  const currentSnapshot = JSON.stringify({ formData, taskSnapshot: taskSnapshot(selectedProject ? pendingTasks : pendingTasks), customerType, newCustomer });
  const hasUnsavedChanges = initialSnapshot !== null && initialSnapshot !== currentSnapshot;

  useEffect(() => {
    if (location.state?.view === 'pending_billing') {
      setProjectTab('pending_billing');
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useLayoutEffect(() => {
    if (autoOpenProjectId && projects.length > 0) {
      const projToOpen = projects.find((p: any) => p.id === autoOpenProjectId);
      if (projToOpen) openProjectDetails(projToOpen, role === 'user' ? 'user' : 'admin', false);
    }
    if (targetProjectId && projects.length > 0) {
      const projToOpen = projects.find((p: any) => p.id === targetProjectId);
      if (projToOpen) {
        openProjectDetails(projToOpen, role === 'user' ? 'user' : 'admin', true);
        setTargetProjectId(null); 
      }
    }
  }, [autoOpenProjectId, targetProjectId, projects, role, setTargetProjectId]);

  const loadProjectExpenses = async (projectId: number) => {
    try {
      const { data, error } = await supabase.from('expenses').select('*').eq('project_id', projectId);
      if (error) throw error;
      setProjectExpenses(data || []);
    } catch (err) { console.error("Failed to load OpEx", err); }
  };

  const pendingBillingProjects = projects.filter(p => {
    if ((p.expected_amount || 0) <= 0) return false;
    if (invoices.some((inv: any) => inv.project_id === p.id)) return false;
    if (p.status === 'Cancelled') return false;
    if (isGlobalAdmin) {
       if (filterCompanyId !== "all" && p.company_id?.toString() !== filterCompanyId) return false;
    } else {
       if (p.company_id?.toString() !== currentCompanyId?.toString()) return false;
    }
    return true;
  });

  const baseProjects = projectTab === 'pending_billing' ? pendingBillingProjects : projects;

  const visibleProjects = baseProjects.filter(p => {
    if (!p.name) return false;
    const projComp = companies.find((c: any) => c.id?.toString() === p.company_id?.toString());
    const customer = customers.find((c: any) => c.id?.toString() === p.customer_id?.toString());
    const searchTarget = `${p.name} ${projComp?.name || ''} ${customer?.name || ''}`.toLowerCase();
    const matchesSearch = searchTarget.includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "All" || p.status === filterStatus;

    if (isGlobalAdmin) {
      const matchesCompany = filterCompanyId === "all" || p.company_id?.toString() === filterCompanyId;
      return matchesSearch && matchesStatus && matchesCompany;
    }

    const isAssigned = isHead || (Array.isArray(p.assignee_ids) ? p.assignee_ids : []).includes(employeeId);
    return matchesSearch && matchesStatus && isAssigned && p.company_id?.toString() === currentCompanyId?.toString();
  }).sort((a, b) => {
    if (sortOption === "newest") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else if (sortOption === "due_date_asc") {
      const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return dateA - dateB;
    } else if (sortOption === "due_date_desc") {
      const dateA = a.due_date ? new Date(a.due_date).getTime() : -Infinity;
      const dateB = b.due_date ? new Date(b.due_date).getTime() : -Infinity;
      return dateB - dateA;
    }
    return 0;
  });

  const totalPages = Math.ceil(visibleProjects.length / itemsPerPage) || 1;
  const paginatedProjects = visibleProjects.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const availableCustomers = customers.filter(c => c.company_id === parseInt(formData.company_id || '0'));
  
  const availableEmployees = employees.filter(emp => {
    const assignments = emp.company_roles && emp.company_roles.length > 0 ? emp.company_roles : [{ company_id: emp.company_id, access_level: emp.access_level }];
    const hasGlobalAdmin = assignments.some((cr: any) => cr.access_level === 'admin');
    if (hasGlobalAdmin) return false;
    return assignments.some((cr: any) => cr.company_id?.toString() === formData.company_id?.toString());
  });

  const handleCloseModal = () => {
    if (hasUnsavedChanges) { setShowDiscardPrompt(true); return; }
    executeClose();
  };

  const executeClose = () => {
    setIsModalOpen(false); setIsInstantOpen(false); setInitialSnapshot(null); setShowDiscardPrompt(false); setEditingPaymentId(null); setEditingTaskKey(null);
    if (onClearOverride) onClearOverride();
    if (location.state?.returnTo) {
      navigate(location.state.returnTo, { state: { openProject: location.state.keepOpen, showLoadingMask: true } });
    }
  };

  const handleProjectClick = (project: any) => {
    const projComp = companies.find((c: any) => c.id === project.company_id);
    const isAcademyProj = projComp?.business_type === 'academy' || ['Course', 'Workshop', 'Internship'].includes(project.metadata?.type);
    if (isGlobalAdmin && isAcademyProj) {
      if (onCrossHandoff) onCrossHandoff(project.id, project.company_id);
      return;
    }
    if ((role === 'admin' || role === 'head') && (Array.isArray(project.assignee_ids) ? project.assignee_ids : []).includes(employeeId)) {
      setRoleSelectProject(project);
    } else {
      openProjectDetails(project, role === 'user' ? 'user' : 'admin');
      if (projectTab === 'pending_billing' && showFinance) setModalTab('finance');
    }
  };

  const openNewProject = () => {
    setViewMode('admin'); setSelectedProject(null); setIsInstantOpen(false);
    const defaultFormData = { 
      name: "", description: "", priority: "Medium", status: "Planning", expected_amount: 0, 
      approval_date: today, due_date: "", company_id: currentCompanyId?.toString() || "", 
      customer_id: "", internal_company_id: "", resource_links: [], assignee_ids: [], 
      milestones: DEFAULT_MILESTONES 
    };
    setFormData(defaultFormData); setCustomerType("existing"); setNewCustomer({ name: "", phone: "" }); 
    setPendingTasks([]); setProjectExpenses([]); setNewTaskTitle(""); setNewTaskAssignee(""); setNewTaskDeadline("");
    setAllocationsForm({}); setExpandedFinanceEmpId(null); setShowResourceForm(false); setShowDescription(false);
    setModalTab("details"); setEditingPaymentId(null); setEditingTaskKey(null);
    setInitialSnapshot(JSON.stringify({ formData: defaultFormData, taskSnapshot: [], customerType: "existing", newCustomer: { name: "", phone: "" } }));
    setIsModalOpen(true);
  };

  const openProjectDetails = (project: any, mode: 'admin' | 'user', instant = false) => {
    setViewMode(mode); setRoleSelectProject(null); setSelectedProject(project); setIsInstantOpen(instant);
    const safeMilestones = {
      in_progress: { ...DEFAULT_MILESTONES.in_progress, ...(project.milestones?.in_progress || {}) },
      review: { ...DEFAULT_MILESTONES.review, ...(project.milestones?.review || {}) },
      completed: { ...DEFAULT_MILESTONES.completed, ...(project.milestones?.completed || {}) }
    };
    let mappedLinks = Array.isArray(project.resource_links) ? project.resource_links : [];
    if (project.drive_folder_url && mappedLinks.length === 0) {
      mappedLinks = [{ id: crypto.randomUUID(), title: "Primary Workspace", url: project.drive_folder_url, type: 'drive' }];
    }
    const loadedFormData = {
      name: project.name || "", description: project.description || "", priority: project.priority || "Medium", status: project.status || "Planning", 
      expected_amount: project.expected_amount || 0, approval_date: project.approval_date || today, due_date: project.due_date || "", 
      company_id: project.company_id?.toString() || "", customer_id: project.customer_id?.toString() || "", 
      internal_company_id: project.internal_company_id?.toString() || "", resource_links: mappedLinks, 
      assignee_ids: Array.isArray(project.assignee_ids) ? project.assignee_ids : [], milestones: safeMilestones
    };
    const loadedCustomerType = project.internal_company_id ? "in_house" : project.customer_id ? "existing" : "in_house";
    const loadedTasks = tasks.filter((t: any) => t.project_id?.toString() === project.id?.toString());
    setFormData(loadedFormData); setCustomerType(loadedCustomerType); setNewCustomer({ name: "", phone: "" }); 
    setPendingTasks(loadedTasks); loadProjectExpenses(project.id);
    setNewTaskTitle(""); setNewTaskAssignee(""); setNewTaskDeadline(""); setExpandedFinanceEmpId(null); setShowResourceForm(false);
    setTimelineModalEmpId(null); setReactionFormId(null); setShowDescription(!!project.description); setEditingPaymentId(null); setEditingTaskKey(null);
    const initialTaskSnapshot = loadedTasks.map((t: any) => ({ id: t.id, title: t.title, assignee_id: t.assignee_id, deadline: t.deadline, is_completed: t.is_completed }));
    setInitialSnapshot(JSON.stringify({ formData: loadedFormData, taskSnapshot: initialTaskSnapshot, customerType: loadedCustomerType, newCustomer: { name: "", phone: "" } }));
    const currentAlloc: any = {};
    if (Array.isArray(project.assignee_ids)) {
      project.assignee_ids.forEach((id: number) => {
        const a = projectAllocations.find(pa => pa.project_id?.toString() === project.id?.toString() && pa.employee_id?.toString() === id.toString());
        currentAlloc[id] = { allocated: a?.allocated_amount || 0, incentive: a?.incentive_amount || 0 };
      });
    }
    setAllocationsForm(currentAlloc); setModalTab("details"); setIsModalOpen(true);
  };

  const handleMilestoneToggle = (phase: keyof typeof DEFAULT_MILESTONES, key: string) => {
    if (isUserView) return;
    const newMilestones = { ...formData.milestones };
    if (!newMilestones[phase]) newMilestones[phase] = { ...DEFAULT_MILESTONES[phase] };
    newMilestones[phase] = { ...newMilestones[phase], [key]: !newMilestones[phase][key as keyof typeof newMilestones[typeof phase]] };
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
    if (!formData.name.trim()) { setModalTab('details'); return setCustomAlert({ title: "Validation Error", message: "Project Name is mandatory.", type: "error" }); }
    if (!formData.company_id) { setModalTab('details'); return setCustomAlert({ title: "Validation Error", message: "Owning Subsidiary is mandatory.", type: "error" }); }
    if (customerType === 'existing' && !formData.customer_id) { setModalTab('details'); return setCustomAlert({ title: "Validation Error", message: "Customer / Client is mandatory.", type: "error" }); }
    if (customerType === 'new' && !newCustomer.name.trim()) { setModalTab('details'); return setCustomAlert({ title: "Validation Error", message: "New Client Name is mandatory.", type: "error" }); }
    if (customerType === 'in_house' && !formData.internal_company_id) { setModalTab('details'); return setCustomAlert({ title: "Validation Error", message: "Internal Target is mandatory.", type: "error" }); }

    let finalCustomerId: number | null = formData.customer_id ? parseInt(formData.customer_id) : null;
    let finalInternalId: number | null = null;
    setIsSaving(true);
    try {
      if (customerType === 'new') {
        const { data: cData, error: cError } = await supabase.from('customers').insert([{ company_id: parseInt(formData.company_id), name: newCustomer.name, phone: newCustomer.phone }]).select().single();
        if (cError) throw cError;
        finalCustomerId = cData.id;
      } else if (customerType === 'in_house') { 
        finalCustomerId = null; finalInternalId = formData.internal_company_id ? parseInt(formData.internal_company_id) : null;
      }
      const payload = { 
        ...formData, company_id: parseInt(formData.company_id), customer_id: finalCustomerId, internal_company_id: finalInternalId, 
        approval_date: formData.approval_date || null, due_date: formData.due_date || null, drive_folder_url: null,
        resource_links: formData.resource_links, milestones: formData.milestones
      };

      let targetProjectId = selectedProject?.id;
      if (!selectedProject) {
        const { data, error } = await supabase.from('projects').insert([payload]).select().single();
        if (error) throw new Error(error.message);
        targetProjectId = data.id;
      } else {
        const { error } = await supabase.from('projects').update(payload).eq('id', selectedProject.id);
        if (error) throw new Error(error.message);
      }

      const originalTasks = selectedProject ? tasks.filter((t: any) => t.project_id?.toString() === selectedProject.id?.toString()) : [];
      const tasksToInsert = pendingTasks.filter(t => !t.id).map(t => ({ project_id: targetProjectId, title: t.title, assignee_id: t.assignee_id, is_completed: t.is_completed, deadline: t.deadline }));
      const tasksToUpdate = pendingTasks.filter(st => {
        if (!st.id) return false;
        const ot = originalTasks.find((o: any) => o.id === st.id);
        if (!ot) return false;
        return st.title !== ot.title || st.assignee_id !== ot.assignee_id || st.deadline !== ot.deadline || st.is_completed !== ot.is_completed;
      });
      const tasksToDelete = originalTasks.filter((ot: any) => !pendingTasks.some(st => st.id === ot.id)).map((t: any) => t.id);

      if (tasksToInsert.length > 0) { const { error } = await supabase.from('project_tasks').insert(tasksToInsert); if (error) throw new Error(`Failed to insert tasks: ${error.message}`); }
      if (tasksToDelete.length > 0) { const { error } = await supabase.from('project_tasks').delete().in('id', tasksToDelete); if (error) throw new Error(`Failed to delete tasks: ${error.message}`); }
      for (const tu of tasksToUpdate) { const { error } = await supabase.from('project_tasks').update({ title: tu.title, assignee_id: tu.assignee_id, is_completed: tu.is_completed, deadline: tu.deadline }).eq('id', tu.id); if (error) throw new Error(`Failed to update task: ${error.message}`); }

      await fetchAllData(); 
      const finalTasks = tasks.filter((t: any) => t.project_id?.toString() === targetProjectId?.toString());
      setPendingTasks(finalTasks);
      const newTaskSnapshot = finalTasks.map((t: any) => ({ id: t.id, title: t.title, assignee_id: t.assignee_id, deadline: t.deadline, is_completed: t.is_completed }));
      setInitialSnapshot(JSON.stringify({ formData, taskSnapshot: newTaskSnapshot, customerType, newCustomer }));

      if(modalTab === 'details' || modalTab === 'tasks') {
        handleCloseModal(); 
      } else {
        setCustomAlert({ title: "Success", message: "Project updated successfully.", type: "success" });
      }
    } catch (error: any) { setCustomAlert({ title: "Error", message: error.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedProject) return;
    if (formData.expected_amount <= 0) return setCustomAlert({ title: "Invalid Amount", message: "Expected Value must be greater than 0 to generate an invoice.", type: "error" });
    setIsSaving(true);
    try {
      const { data: existingInvoices, error: checkError } = await supabase.from('invoices').select('id').eq('project_id', selectedProject.id);
      if (checkError) throw checkError;
      if (existingInvoices && existingInvoices.length > 0) return setCustomAlert({ title: "Duplicate Invoice", message: "An invoice has already been generated for this project.", type: "error" });
      const invPayload = { company_id: selectedProject.company_id, customer_id: selectedProject.customer_id, project_id: selectedProject.id, invoice_number: `INV-${Math.floor(10000 + Math.random() * 90000)}`, issue_date: today, due_date: selectedProject.due_date || today, subtotal: formData.expected_amount, total_amount: formData.expected_amount, status: 'Pending' };
      const { data: invData, error: invError } = await supabase.from('invoices').insert([invPayload]).select().single();
      if (invError) throw new Error(invError.message);
      if (invData) {
        const { error: itemError } = await supabase.from('invoice_items').insert([{ invoice_id: invData.id, description: `Project Milestone: ${selectedProject.name}`, quantity: 1, rate: formData.expected_amount, total: formData.expected_amount }]);
        if (itemError) throw new Error(itemError.message);
      }
      await fetchAllData();
      setCustomAlert({ title: "Invoice Generated", message: "Invoice generated and approved successfully!", type: "success" });
      if (projectTab === 'pending_billing' && pendingBillingProjects.length <= 1) setProjectTab('all');
    } catch (error: any) { setCustomAlert({ title: "Error", message: error.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const handleSaveAllocations = async () => {
    if (!selectedProject) return;
    setIsSaving(true);
    try {
      for (const empId of Object.keys(allocationsForm)) {
        const alloc = allocationsForm[parseInt(empId)];
        const existing = projectAllocations.find(pa => pa.project_id?.toString() === selectedProject.id?.toString() && pa.employee_id?.toString() === empId.toString());
        if (existing) {
          const { error } = await supabase.from('project_allocations').update({ allocated_amount: alloc.allocated, incentive_amount: alloc.incentive }).eq('id', existing.id);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await supabase.from('project_allocations').insert([{ project_id: selectedProject.id, employee_id: parseInt(empId), allocated_amount: alloc.allocated, incentive_amount: alloc.incentive }]);
          if (error) throw new Error(error.message);
        }
      }
      setCustomAlert({ title: "Allocations Saved", message: "Team allocations have been successfully updated.", type: "success" });
      await fetchAllData();
    } catch (error: any) { setCustomAlert({ title: "Error", message: error.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const handleRecordProjectPayment = async () => {
    if (!paymentForm.employee_id || paymentForm.amount <= 0) return setCustomAlert({ title: "Invalid Input", message: "Select an employee and enter an amount greater than 0.", type: "error" });
    setIsSaving(true);
    try {
      const { error } = await supabase.from('salary_payments').insert([{
        employee_id: parseInt(paymentForm.employee_id), company_id: selectedProject.company_id, project_id: selectedProject.id,
        amount: paymentForm.amount, payment_type: paymentForm.payment_type, payment_date: today, payment_month: today.substring(0, 7), notes: paymentForm.notes
      }]);
      if (error) throw new Error(error.message);
      setPaymentForm({ employee_id: "", amount: 0, payment_type: "Advance", notes: "" });
      setExpandedFinanceEmpId(parseInt(paymentForm.employee_id)); 
      await fetchAllData();
    } catch (error: any) { setCustomAlert({ title: "Error", message: error.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const handleAddExpense = async () => {
    if (!selectedProject) return;
    if (!newExpense.description.trim() || newExpense.amount <= 0) return setCustomAlert({ title: "Invalid Input", message: "Description and amount are required.", type: "error" });
    setIsSaving(true);
    try {
      const { data, error } = await supabase.from('expenses').insert([{
        company_id: selectedProject.company_id, project_id: selectedProject.id, category: newExpense.category,
        description: newExpense.description, amount: newExpense.amount, created_by: employeeId, expense_date: today, status: 'Completed'
      }]).select().single();
      if (error) throw new Error(error.message);
      setProjectExpenses([data, ...projectExpenses]);
      setNewExpense({ category: "Software & Tools", description: "", amount: 0 });
    } catch (err: any) { setCustomAlert({ title: "Error", message: err.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
      if (error) throw error;
      setProjectExpenses(projectExpenses.filter(e => e.id !== expenseId));
    } catch (err: any) { setCustomAlert({ title: "Error", message: err.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const handleDeleteProjectPayment = (paymentId: number) => {
    setConfirmAction({
      title: "Remove Payment",
      message: "Are you sure you want to remove this payment record? This action cannot be undone.",
      action: async () => {
        setIsSaving(true);
        try {
          const { error } = await supabase.from('salary_payments').delete().eq('id', paymentId);
          if (error) throw new Error(error.message);
          await fetchAllData();
        } catch (error: any) { setCustomAlert({ title: "Error", message: error.message, type: "error" }); } finally { setIsSaving(false); }
      }
    });
  };

  const handleUpdateProjectPayment = async (paymentId: number, empId: number) => {
    if (editPaymentForm.amount <= 0) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('salary_payments').update({ amount: editPaymentForm.amount, payment_type: editPaymentForm.payment_type }).eq('id', paymentId);
      if (error) throw new Error(error.message);
      setEditingPaymentId(null);
      await fetchAllData();
    } catch (error: any) { setCustomAlert({ title: "Error", message: error.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const handleSaveMyReport = async () => {
    if (!selectedProject || !myReportText.trim()) return;
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id?.toString() === selectedProject.id?.toString() && r.employee_id?.toString() === employeeId?.toString());
      const newEntry = { id: crypto.randomUUID(), type: 'note', text: myReportText.trim(), timestamp: new Date().toISOString() };
      const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];
      const updatedEntries = [...currentEntries, newEntry];

      if (existingReport) {
        const { error } = await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('project_reports').insert([{ project_id: selectedProject.id, employee_id: employeeId, entries: updatedEntries }]);
        if (error) throw new Error(error.message);
      }

      setMyReportText(""); 
      await fetchAllData();
    } catch (e: any) { setCustomAlert({ title: "Error", message: e.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const handleEditUserEntry = async (entryId: string) => {
    if (!selectedProject || !editingEntryText.trim()) return;
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id?.toString() === selectedProject.id?.toString() && r.employee_id?.toString() === employeeId?.toString());
      if (!existingReport) return;
      const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];
      const updatedEntries = currentEntries.map((e: any) => e.id === entryId ? { ...e, text: editingEntryText.trim() } : e);
      const { error } = await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
      if (error) throw new Error(error.message);
      setEditingEntryId(null); setEditingEntryText(""); await fetchAllData();
    } catch (e: any) { setCustomAlert({ title: "Error", message: e.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const handleDeleteEntry = (empId: number, entryId: string) => {
    setConfirmAction({
      title: "Delete Log",
      message: "Are you sure you want to delete this log entry?",
      action: async () => {
        setIsSaving(true);
        try {
          const existingReport = reports.find(r => r.project_id?.toString() === selectedProject.id?.toString() && r.employee_id?.toString() === empId?.toString());
          if (!existingReport) return;
          const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];
          const updatedEntries = currentEntries.filter((e: any) => e.id !== entryId);
          const { error } = await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
          if (error) throw new Error(error.message);
          await fetchAllData();
        } catch (e: any) { setCustomAlert({ title: "Error", message: e.message, type: "error" }); } finally { setIsSaving(false); }
      }
    });
  };

  const handleAdminReact = async (empId: number, entryId: string, status: string, customText: string = "") => {
    setIsSaving(true);
    try {
      const existingReport = reports.find(r => r.project_id?.toString() === selectedProject.id?.toString() && r.employee_id?.toString() === empId?.toString());
      if (!existingReport) return;
      const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];
      const updatedEntries = currentEntries.map((e: any) => { if (e.id === entryId) return { ...e, reaction: { status, text: customText.trim(), timestamp: new Date().toISOString() } }; return e; });
      const { error } = await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
      if (error) throw new Error(error.message);
      setReactionFormId(null); setReactionText(""); await fetchAllData();
    } catch (e: any) { setCustomAlert({ title: "Error", message: e.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const handleDeleteReaction = (empId: number, entryId: string) => {
    setConfirmAction({
      title: "Remove Feedback",
      message: "Are you sure you want to remove this feedback?",
      action: async () => {
        setIsSaving(true);
        try {
          const existingReport = reports.find(r => r.project_id?.toString() === selectedProject.id?.toString() && r.employee_id?.toString() === empId?.toString());
          if (!existingReport) return;
          const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];
          const updatedEntries = currentEntries.map((e: any) => { if (e.id === entryId) { const { reaction, ...rest } = e; return rest; } return e; });
          const { error } = await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
          if (error) throw new Error(error.message);
          await fetchAllData();
        } catch (e: any) { setCustomAlert({ title: "Error", message: e.message, type: "error" }); } finally { setIsSaving(false); }
      }
    });
  };

  const handleDeleteProject = () => {
    setConfirmAction({
      title: "Delete Project",
      message: `Are you sure you want to delete "${selectedProject.name}"? This action cannot be undone.`,
      action: async () => {
        setIsSaving(true);
        const { error } = await supabase.from('projects').delete().eq('id', selectedProject.id);
        if (error) setCustomAlert({ title: "Error", message: error.message, type: "error" });
        await fetchAllData(); executeClose(); setIsSaving(false);
      }
    });
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim() || newTaskAssignee === "") return;
    if (newTaskDeadline && formData.due_date && new Date(newTaskDeadline) > new Date(formData.due_date)) {
      return setCustomAlert({ title: "Invalid Deadline", message: `Task deadline cannot exceed the project's main due date (${formData.due_date}).`, type: "error" });
    }
    setPendingTasks([...pendingTasks, { tempId: crypto.randomUUID(), title: newTaskTitle, assignee_id: newTaskAssignee, is_completed: false, deadline: newTaskDeadline || null }]);
    setNewTaskTitle(""); setNewTaskAssignee(""); setNewTaskDeadline("");
  };

  const handleDeleteTask = (task: any) => {
    setConfirmAction({
      title: "Delete Task",
      message: `Are you sure you want to remove "${task.title}"?`,
      action: () => { setPendingTasks(prev => prev.filter(t => t.id ? t.id !== task.id : t.tempId !== task.tempId)); }
    });
  };

  const handleSaveTaskEdit = (task: any) => {
    if (!editTaskForm.title.trim() || !editTaskForm.assignee_id) return setCustomAlert({ title: "Missing Information", message: "Title and Assignee are required.", type: "error" });
    setPendingTasks(prev => prev.map(t => (t.id ? t.id === task.id : t.tempId === task.tempId) ? { ...t, title: editTaskForm.title, assignee_id: editTaskForm.assignee_id, deadline: editTaskForm.deadline || null } : t));
    setEditingTaskKey(null);
  };

  const handleAdminToggleTask = (task: any, index?: number) => {
    if (isUserView && !isImpersonating) return; 
    setPendingTasks(prev => prev.map(t => (t.id ? t.id === task.id : t.tempId === task.tempId) ? { ...t, is_completed: !t.is_completed } : t));
  };

  const handleEmployeeUploadComplete = async () => {
    if (!taskToUpload || !selectedProject) return;
    if (!uploadNote.trim()) return setCustomAlert({ title: "Missing Note", message: "Please provide a brief note detailing what you uploaded or updated.", type: "error" });

    setIsSaving(true);
    try {
      if (taskToUpload.id !== 'general') {
        const { error: taskError } = await supabase.from('project_tasks').update({ is_completed: true }).eq('id', taskToUpload.id);
        if (taskError) throw new Error(taskError.message);
      }
      const existingReport = reports.find(r => r.project_id?.toString() === selectedProject.id?.toString() && r.employee_id?.toString() === employeeId?.toString());
      const newEntry = { id: crypto.randomUUID(), type: 'upload', task_title: taskToUpload.title, text: uploadNote.trim(), timestamp: new Date().toISOString() };
      const currentEntries = Array.isArray(existingReport?.entries) ? existingReport.entries : [];
      const updatedEntries = [...currentEntries, newEntry];

      if (existingReport) {
        const { error: reportError } = await supabase.from('project_reports').update({ entries: updatedEntries }).eq('id', existingReport.id);
        if (reportError) throw new Error(reportError.message);
      } else {
        const { error: reportError } = await supabase.from('project_reports').insert([{ project_id: selectedProject.id, employee_id: employeeId, entries: updatedEntries }]);
        if (reportError) throw new Error(reportError.message);
      }

      if (taskToUpload.id !== 'general') setPendingTasks(prev => prev.map(t => t.id === taskToUpload.id ? { ...t, is_completed: true } : t));
      await fetchAllData(); setIsUploadModalOpen(false); setTaskToUpload(null); setUploadNote("");
    } catch (e: any) { setCustomAlert({ title: "Error", message: e.message, type: "error" }); } finally { setIsSaving(false); }
  };

  const getAvatar = (id: number) => employees.find(e => e.id?.toString() === id?.toString());

  const displayTasks = selectedProject ? pendingTasks.sort((a: any, b: any) => ((a.id || 0) > (b.id || 0) ? 1 : -1)) : pendingTasks;

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'Planning': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'In Progress': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Review': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Completed': return 'bg-green-50 text-green-700 border-green-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getDueDateStatus = (dateString: string) => {
    if (!dateString) return null;
    const due = new Date(dateString);
    const now = new Date(today);
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'Overdue', style: 'text-red-600 bg-red-50 border-red-200', icon: AlertCircle, dot: 'bg-red-500' };
    if (diffDays === 0) return { label: 'Due Today', style: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock, dot: 'bg-amber-500' };
    if (diffDays <= 7) return { label: `Due in ${diffDays}d`, style: 'text-green-600 bg-green-50 border-green-200', icon: Clock, dot: 'bg-green-500' };
    return { label: `Due in ${diffDays}d`, style: 'text-slate-600 bg-slate-50 border-slate-200', icon: Calendar, dot: 'bg-slate-400' };
  };

  const getReactionVisuals = (status: string) => {
    switch(status) {
      case 'Approved': return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: ThumbsUp };
      case 'Rejected': return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: ThumbsDown };
      case 'Reviewed': return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Eye };
      default: return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: MessageCircle };
    }
  };

  const getTabTitle = (tab: string) => {
    switch(tab) {
      case 'details': return 'Project Details';
      case 'team': return 'Team Assignment';
      case 'tasks': return 'Action Items';
      case 'progress': return isUserView ? 'My Timeline' : 'Milestones & Logs';
      case 'opex': return 'Operational Expenses';
      case 'finance': return 'Finances & Budget';
      default: return '';
    }
  };

  const userAllocation = selectedProject ? projectAllocations.find(pa => pa.project_id?.toString() === selectedProject.id?.toString() && pa.employee_id?.toString() === employeeId?.toString()) : null;
  const userProjectPayments = selectedProject ? salaryPayments.filter(sp => sp.project_id?.toString() === selectedProject.id?.toString() && sp.employee_id?.toString() === employeeId?.toString()) : [];
  const userTotalEarned = userProjectPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const userTotalAllocated = (userAllocation?.allocated_amount || 0) + (userAllocation?.incentive_amount || 0);
  const userBalanceDue = Math.max(0, userTotalAllocated - userTotalEarned);

  const totalOpEx = projectExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalAllocations = Object.values(allocationsForm).reduce((acc: any, val: any) => acc + Number(val.allocated) + Number(val.incentive), 0);
  const totalCosts = totalOpEx + totalAllocations;
  const grossMargin = formData.expected_amount - totalCosts;
  const marginPercent = formData.expected_amount > 0 ? Math.round((grossMargin / formData.expected_amount) * 100) : 0;
  
  const hasAllocationChanges = selectedProject && (Array.isArray(formData.assignee_ids) ? formData.assignee_ids : []).some(empId => {
    const formAlloc = allocationsForm[empId] || { allocated: 0, incentive: 0 };
    const originalAlloc = projectAllocations.find(pa => pa.project_id?.toString() === selectedProject.id?.toString() && pa.employee_id?.toString() === empId.toString());
    return Number(formAlloc.allocated) !== Number(originalAlloc?.allocated_amount || 0) || Number(formAlloc.incentive) !== Number(originalAlloc?.incentive_amount || 0);
  });

  const allRelevantProjects = projects.filter(p => {
    if (!p.name) return false;
    if (isGlobalAdmin) return filterCompanyId === "all" || p.company_id?.toString() === filterCompanyId;
    const isAssigned = isHead || (Array.isArray(p.assignee_ids) ? p.assignee_ids : []).includes(employeeId);
    return isAssigned && p.company_id?.toString() === currentCompanyId?.toString();
  });

  const activeProjectsCount = allRelevantProjects.filter(p => p.status !== 'Completed').length;
  const completedProjectsCount = allRelevantProjects.filter(p => p.status === 'Completed').length;
  const overdueProjectsCount = allRelevantProjects.filter(p => {
    if (p.status === 'Completed' || !p.due_date) return false;
    return new Date(p.due_date).getTime() < new Date(today).getTime();
  }).length;
  const totalTasksCount = tasks.filter((t: any) => allRelevantProjects.some(p => p.id?.toString() === t.project_id?.toString())).length;

  return (
    <>
      <div className="max-w-[1200px] mx-auto space-y-8 animate-in fade-in duration-700 pb-12 relative z-0 print:p-0 print:m-0">

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 print:hidden">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Projects Workspace</h1>
            <p className="text-sm font-medium text-slate-500 mt-1">Manage project assignments, timelines, and budgets efficiently.</p>
          </div>
          {(role === 'admin' || role === 'head') && (
            <button type="button" onClick={openNewProject} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center shrink-0">
              <Plus className="h-4 w-4 mr-2" /> New Project
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row items-center justify-between gap-6 print:hidden w-full">
          <div className="flex items-center gap-4 w-full sm:w-1/4">
            <div className="h-12 w-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{activeProjectsCount}</p>
              <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Active Projects</p>
            </div>
          </div>
          <div className="hidden sm:block w-px h-12 bg-slate-200 shrink-0"></div>
          <div className="flex items-center gap-4 w-full sm:w-1/4">
            <div className="h-12 w-12 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{overdueProjectsCount}</p>
              <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Overdue</p>
            </div>
          </div>
          <div className="hidden sm:block w-px h-12 bg-slate-200 shrink-0"></div>
          <div className="flex items-center gap-4 w-full sm:w-1/4">
            <div className="h-12 w-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
              <ListTodo className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{totalTasksCount}</p>
              <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Total Tasks</p>
            </div>
          </div>
          <div className="hidden sm:block w-px h-12 bg-slate-200 shrink-0"></div>
          <div className="flex items-center gap-4 w-full sm:w-1/4">
            <div className="h-12 w-12 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0 border border-green-100">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{completedProjectsCount}</p>
              <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Completed</p>
            </div>
          </div>
        </div>

        <div className="flex gap-4 border-b border-slate-200 overflow-x-auto max-sm:[&::-webkit-scrollbar]:hidden print:hidden">
           <button onClick={() => setProjectTab('all')} className={`pb-3 text-sm font-semibold tracking-wide transition-all border-b-2 whitespace-nowrap ${projectTab === 'all' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
             All Workflows
           </button>
           {(isGlobalAdmin || showFinance) && pendingBillingProjects.length > 0 && (
             <button onClick={() => setProjectTab('pending_billing')} className={`pb-3 text-sm font-semibold tracking-wide transition-all border-b-2 whitespace-nowrap flex items-center gap-2 ${projectTab === 'pending_billing' ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
               Awaiting Billing
               <span className={`px-2 py-0.5 rounded text-xs font-bold ${projectTab === 'pending_billing' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{pendingBillingProjects.length}</span>
             </button>
           )}
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-3 print:hidden">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search projects by name, client or team..." 
              value={searchQuery} 
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} 
              className="w-full h-10 pl-9 pr-4 rounded-lg border border-slate-200 text-sm font-medium outline-none bg-slate-50 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 text-slate-900 transition-colors" 
            />
          </div>
          
          <div className="w-full sm:w-48 shrink-0">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="w-full h-10 rounded-lg bg-slate-50 border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none cursor-pointer hover:bg-white focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-colors appearance-none"
              style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px' }}
            >
               <option value="newest">Newest First</option>
               <option value="due_date_asc">Due Date (Earliest)</option>
               <option value="due_date_desc">Due Date (Latest)</option>
            </select>
          </div>

          {role === 'admin' && !activeWorkspace && (
            <div className="w-full sm:w-60 shrink-0">
              <select
                value={filterCompanyId}
                onChange={(e) => { setFilterCompanyId(e.target.value); setCurrentPage(1); }}
                className="w-full h-10 rounded-lg bg-slate-50 border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none cursor-pointer hover:bg-white focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-colors appearance-none"
                style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px' }}
              >
                <option value="all">Global (All Subsidiaries)</option>
                {companies.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div className="w-full sm:w-48 shrink-0">
            <select 
              value={filterStatus} 
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }} 
              className="w-full h-10 rounded-lg bg-slate-50 border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none cursor-pointer appearance-none hover:bg-white focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-colors"
              style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px' }}
            >
               <option value="All">All Statuses</option>
               {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg shrink-0">
            <button 
              type="button" 
              onClick={() => setLayoutView('grid')} 
              title="Grid View"
              className={`h-8 w-8 rounded flex items-center justify-center transition-all ${layoutView === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button 
              type="button" 
              onClick={() => setLayoutView('list')} 
              title="List View"
              className={`h-8 w-8 rounded flex items-center justify-center transition-all ${layoutView === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 print:hidden">
          {visibleProjects.length === 0 ? (
             <div className="h-48 sm:h-64 border border-slate-200 border-dashed rounded-xl flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                <FolderKanban className="h-8 w-8 sm:h-10 sm:w-10 mb-2 sm:mb-3 text-slate-300" />
                <p className="text-sm font-medium uppercase tracking-wider">{projectTab === 'pending_billing' ? 'No Projects Awaiting Billing' : 'No Records Found'}</p>
             </div>
          ) : layoutView === 'grid' ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
              {paginatedProjects.map(project => {
                const projectTasks = tasks.filter((t: any) => t.project_id?.toString() === project.id?.toString());
                const completedTasks = projectTasks.filter((t: any) => t.is_completed).length;
                const totalTasks = projectTasks.length;
                const progressPct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
                const radius = 18; const circumference = 2 * Math.PI * radius; const progressOffset = circumference - (progressPct / 100) * circumference;

                const dueStatus = project.status !== 'Completed' ? getDueDateStatus(project.due_date) : null;
                const projComp = companies.find(c => c.id?.toString() === project.company_id?.toString());
                const isAcademyProj = projComp?.business_type === 'academy' || ['Course', 'Workshop', 'Internship'].includes(project.metadata?.type);
                const owningCompanyName = projComp?.name;

                return (
                  <div 
                     key={project.id} 
                     className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden group`}
                  >
                    {dueStatus && (
                      <div className={`px-4 py-2 border-b flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${dueStatus.style}`}>
                        <dueStatus.icon className="h-3 w-3" /> {dueStatus.label}
                      </div>
                    )}

                    <div className="p-5 sm:p-6 flex flex-col gap-6">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                             {isAcademyProj && <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"><BookOpen className="h-3 w-3" /> Academy Program</span>}
                             {projectTab === 'pending_billing' && <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"><Receipt className="h-3 w-3" /> Needs Invoice</span>}
                          </div>
                          
                          <h3 onClick={() => handleProjectClick(project)} className={`text-lg font-semibold text-slate-900 hover:text-blue-600 cursor-pointer transition-colors w-full truncate`}>
                            {project.name}
                            {isGlobalAdmin && owningCompanyName && (
                                <span className="ml-2 inline-block text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded align-middle border border-slate-200">
                                  {owningCompanyName}
                                </span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1 truncate w-full">
                            {!isGlobalAdmin && (owningCompanyName || 'Network')} 
                            {project.customer_id && ` • ${customers.find(c => c.id?.toString() === project.customer_id?.toString())?.name}`}
                            {project.internal_company_id && ` • Internal`}
                          </p>
                        </div>

                        <div className="shrink-0 flex justify-end">
                           <div className={`px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider border ${getStatusStyle(project.status || 'Planning')}`}>
                             {project.status || 'Planning'}
                           </div>
                        </div>
                      </div>

                      <div className="flex flex-row items-center justify-between pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-4">
                           <div className="relative h-12 w-12 flex items-center justify-center shrink-0">
                             <svg className="h-12 w-12 transform -rotate-90">
                               <circle cx="50%" cy="50%" r="18" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-100" />
                               <circle cx="50%" cy="50%" r="18" stroke="currentColor" strokeWidth="3" fill="transparent" strokeDasharray={circumference} strokeDashoffset={progressOffset} strokeLinecap="round" className={`${progressPct === 100 ? 'text-green-500' : 'text-blue-600'} transition-all duration-1000 ease-out`} />
                             </svg>
                             <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-800">{progressPct}%</div>
                           </div>
                           <div className="hidden sm:block border-r border-slate-200 pr-4">
                             <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{isAcademyProj ? 'Modules' : 'Tasks'}</p>
                             <p className="text-sm font-semibold text-slate-900">{completedTasks} / {totalTasks}</p>
                           </div>
                           <div className="flex -space-x-2 pl-1">
                             {(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).slice(0, 4).map((id: number) => {
                               const emp = getAvatar(id);
                               return (
                                 <div key={id} className="h-8 w-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 overflow-hidden shadow-sm" title={emp?.name}>
                                   {emp?.profile_image_url ? <img src={emp.profile_image_url} alt="Profile" className="h-full w-full object-cover" /> : (emp?.name || 'U').charAt(0).toUpperCase()}
                                 </div>
                               )
                             })}
                             {(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).length > 4 && <div className="h-8 w-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shadow-sm">+{(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).length - 4}</div>}
                             {(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).length === 0 && <span className="text-xs font-medium text-slate-400 pl-2">Unassigned</span>}
                           </div>
                        </div>

                        {showFinance && (
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{isAcademyProj ? 'Batch Value' : 'Value'}</span>
                            <span className="text-sm font-bold text-slate-900">₹{(project.expected_amount || 0).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[850px]">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <th className="py-4 pl-6 pr-4">PROJECT</th>
                      <th className="py-4 px-4">TEAM</th>
                      <th className="py-4 px-4">TASKS</th>
                      <th className="py-4 px-4">PROGRESS</th>
                      <th className="py-4 px-4">STATUS</th>
                      <th className="py-4 px-4">DUE DATE</th>
                      <th className="py-4 pr-6 pl-2 text-right">•••</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm font-medium text-slate-700">
                    {paginatedProjects.map(project => {
                      const projectTasks = tasks.filter((t: any) => t.project_id?.toString() === project.id?.toString());
                      const completedTasks = projectTasks.filter((t: any) => t.is_completed).length;
                      const totalTasks = projectTasks.length;
                      const progressPct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

                      const projComp = companies.find(c => c.id?.toString() === project.company_id?.toString());
                      const customer = customers.find(c => c.id?.toString() === project.customer_id?.toString());
                      
                      const isOverdue = project.status !== 'Completed' && project.due_date && new Date(project.due_date).getTime() < new Date(today).getTime();

                      const formattedDueDate = project.due_date ? new Date(project.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD';

                      return (
                        <tr 
                          key={project.id} 
                          className="hover:bg-slate-50 transition-colors group relative cursor-pointer"
                          onClick={() => handleProjectClick(project)}
                        >
                          <td className="py-4 pl-6 pr-4 relative">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900 text-sm group-hover:text-blue-600 transition-colors truncate flex items-center gap-1.5">
                                {project.name}
                                {projectTab === 'pending_billing' && <Receipt className="h-3.5 w-3.5 text-amber-500" title="Awaiting Billing" />}
                              </span>
                              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-1">
                                {projComp?.name || 'NETWORK'} {customer?.name ? `• ${customer.name}` : project.internal_company_id ? '• INTERNAL' : ''}
                              </span>
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <div className="flex items-center -space-x-1.5">
                              {(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).slice(0, 4).map((id: number) => {
                                const emp = getAvatar(id);
                                return (
                                  <div 
                                    key={id} 
                                    className="h-8 w-8 rounded-full bg-slate-800 text-white border-2 border-white flex items-center justify-center text-xs font-semibold shadow-sm overflow-hidden" 
                                    title={emp?.name}
                                  >
                                    {emp?.profile_image_url ? (
                                      <img src={emp.profile_image_url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      (emp?.name || 'U').charAt(0).toUpperCase()
                                    )}
                                  </div>
                                );
                              })}
                              {(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).length > 4 && (
                                <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-600 border-2 border-white flex items-center justify-center text-xs font-semibold shadow-sm">
                                  +{(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).length - 4}
                                </div>
                              )}
                              {(Array.isArray(project.assignee_ids) ? project.assignee_ids : []).length === 0 && (
                                <span className="text-slate-400 text-xs font-medium">--</span>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-4 font-semibold text-slate-700">
                            {completedTasks} / {totalTasks}
                          </td>

                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-slate-900 w-8">{progressPct}%</span>
                              <div className="w-24 sm:w-28 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${progressPct === 100 ? 'bg-green-500' : 'bg-blue-600'}`} 
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <span className={`inline-block px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider border ${getStatusStyle(project.status || 'Planning')}`}>
                              {project.status || 'Planning'}
                            </span>
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className={`flex items-center gap-2 text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                              <Calendar className={`h-4 w-4 shrink-0 ${isOverdue ? 'text-red-600' : 'text-slate-400'}`} />
                              <span>{formattedDueDate}</span>
                            </div>
                          </td>

                          <td className="py-4 pr-6 pl-2 text-right">
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); handleProjectClick(project); }} 
                              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="py-4 px-6 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500 font-medium">
                <div>
                  Showing {visibleProjects.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, visibleProjects.length)} of {visibleProjects.length} projects
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 w-8 rounded flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`h-8 w-8 rounded text-sm font-semibold transition-all ${currentPage === page ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 rounded flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {isPrintingPayslip && selectedProject && isUserView && (
          <div className="absolute inset-0 bg-white z-[100] p-10 print:block hidden">
            <div className="text-center mb-10 pb-6 border-b border-slate-200">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Project Payment Remittance</h1>
              <p className="text-sm font-semibold text-slate-500 mt-2 uppercase tracking-widest">{selectedProject.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-10 mb-10 text-sm">
               <div>
                 <p className="text-slate-500 font-semibold uppercase tracking-widest text-xs mb-1">Prepared For</p>
                 <p className="font-bold text-slate-900 text-lg">{getAvatar(employeeId)?.name}</p>
                 <p className="text-slate-600 font-medium">{getAvatar(employeeId)?.role}</p>
               </div>
               <div className="text-right">
                 <p className="text-slate-500 font-semibold uppercase tracking-widest text-xs mb-1">Date Issued</p>
                 <p className="font-bold text-slate-900">{new Date().toLocaleDateString()}</p>
               </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden mb-10">
               <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between font-semibold text-slate-900 text-xs uppercase tracking-widest">
                 <span>Compensation Breakdown</span>
                 <span>Amount</span>
               </div>
               <div className="px-6 py-5 flex justify-between border-b border-slate-200">
                  <span className="font-medium text-slate-700">Project Allocation</span>
                  <span className="font-semibold">₹{(userAllocation?.allocated_amount || 0).toLocaleString()}</span>
               </div>
               <div className="px-6 py-5 flex justify-between border-b border-slate-200">
                  <span className="font-medium text-slate-700">Performance Incentive</span>
                  <span className="font-semibold text-slate-700">+ ₹{(userAllocation?.incentive_amount || 0).toLocaleString()}</span>
               </div>
               <div className="px-6 py-5 bg-slate-50 flex justify-between">
                  <span className="font-bold text-slate-900 text-lg">Total Earnings</span>
                  <span className="font-bold text-slate-900 text-lg">₹{userTotalAllocated.toLocaleString()}</span>
               </div>
            </div>

            <div className="mb-10">
               <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Payment History</h3>
               {userProjectPayments.length === 0 ? <p className="text-sm italic text-slate-500">No payments disbursed yet.</p> : (
                 <div className="space-y-2">
                   {userProjectPayments.map(p => (
                     <div key={p.id} className="flex justify-between items-center border-b border-slate-100 pb-2 text-sm">
                        <span className="text-slate-600">{new Date(p.payment_date).toLocaleDateString()} - {p.payment_type}</span>
                        <span className="font-semibold text-slate-900">₹{parseFloat(p.amount).toLocaleString()}</span>
                     </div>
                   ))}
                 </div>
               )}
            </div>

            <div className="flex justify-end pt-6 border-t border-slate-200">
               <div className="text-right">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Current Balance Due</p>
                  <p className="text-2xl font-bold text-slate-900">₹{userBalanceDue.toLocaleString()}</p>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* ADMIN/USER WORKSPACE PORTAL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {roleSelectProject && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
               <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white rounded-xl p-8 w-full max-w-sm shadow-2xl flex flex-col border border-slate-200">
                  <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-6 border border-blue-100"><Layers className="h-6 w-6" /></div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Open Workspace As</h3>
                  <p className="text-sm font-medium text-slate-500 mb-8">You are assigned to tasks on <strong className="text-slate-800">{roleSelectProject.name}</strong>. How would you like to view it?</p>

                  <div className="space-y-3">
                    <button type="button" onClick={() => openProjectDetails(roleSelectProject, 'admin')} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm">
                       Manage Workspace (Admin)
                    </button>
                    <button type="button" onClick={() => openProjectDetails(roleSelectProject, 'user')} className="w-full bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 rounded-md py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                       My Tasks (User)
                    </button>
                  </div>

                  <button type="button" onClick={() => setRoleSelectProject(null)} className="mt-6 w-full text-slate-500 hover:text-slate-800 font-semibold text-sm transition-colors">Cancel</button>
               </motion.div>
             </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* MAIN PROJECT CREATION / MANAGEMENT MODAL - REDESIGNED SPLIT PANEL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isModalOpen && !isPrintingPayslip && (
            <motion.div 
              initial={isInstantOpen ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.95 }} 
              animate={{ opacity: 1, y: 0, scale: 1 }} 
              exit={{ opacity: 0, y: 40, scale: 0.95 }} 
              transition={isInstantOpen ? { duration: 0 } : undefined}
              onMouseDown={handleCloseModal}
              className="fixed inset-0 z-[9999] flex flex-col items-center justify-center max-sm:px-4 max-sm:pt-20 max-sm:pb-[110px] sm:p-4 bg-slate-900/50 backdrop-blur-sm print:hidden"
            >
              <motion.div 
                initial={isInstantOpen ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.95 }} 
                animate={{ opacity: 1, y: 0, scale: 1 }} 
                exit={{ opacity: 0, y: 40, scale: 0.95 }} 
                transition={isInstantOpen ? { duration: 0 } : undefined}
                onMouseDown={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-full sm:h-[85vh] sm:max-h-[900px] flex flex-col md:flex-row overflow-hidden border border-slate-200 mt-auto sm:mt-0"
              >

                <div className="w-full md:w-72 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0">
                  <div className="p-6 border-b border-slate-200 hidden md:block">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-100 px-2.5 py-1 rounded-md">{isAdminView ? 'Admin Workspace' : 'User Workspace'}</span>
                    <h2 className="text-xl font-bold text-slate-900 mt-4 line-clamp-2 leading-tight">{selectedProject ? selectedProject.name : 'Create New Project'}</h2>
                    {selectedProject && (
                       <span className={`inline-block mt-3 px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider border ${getStatusStyle(formData.status || 'Planning')}`}>
                          {formData.status || 'Planning'}
                       </span>
                    )}
                  </div>
                  
                  <div className="p-4 md:p-6 flex md:flex-col gap-2 overflow-x-auto max-md:[&::-webkit-scrollbar]:hidden flex-1">
                    {!selectedProject ? (
                      <>
                        <div className={`px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-3 ${modalTab === 'details' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500'}`}>
                          <span className="h-6 w-6 rounded bg-white/20 flex items-center justify-center text-xs">1</span> Project Details
                        </div>
                        <div className={`px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-3 ${modalTab === 'team' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500'}`}>
                          <span className="h-6 w-6 rounded bg-slate-200 flex items-center justify-center text-xs text-slate-600">2</span> Assign Team
                        </div>
                        <div className={`px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-3 ${modalTab === 'tasks' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500'}`}>
                          <span className="h-6 w-6 rounded bg-slate-200 flex items-center justify-center text-xs text-slate-600">3</span> Action Items
                        </div>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => setModalTab('details')} className={`text-left px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-3 ${modalTab === 'details' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}`}>
                          <Settings className="h-5 w-5 opacity-70" /> Project Details
                        </button>
                        
                        {!isUserView && (
                          <>
                            <button type="button" onClick={() => setModalTab('team')} className={`text-left px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-3 ${modalTab === 'team' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}`}>
                              <Users className="h-5 w-5 opacity-70" /> Assign Team
                            </button>
                            <button type="button" onClick={() => setModalTab('tasks')} className={`text-left px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-3 ${modalTab === 'tasks' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}`}>
                              <ListTodo className="h-5 w-5 opacity-70" /> Action Items
                            </button>
                          </>
                        )}

                        <button type="button" onClick={() => setModalTab('progress')} disabled={!selectedProject} className={`text-left px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-3 ${!selectedProject ? 'opacity-30 cursor-not-allowed' : modalTab === 'progress' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}`}>
                           <Activity className="h-5 w-5 opacity-70" /> {isUserView ? 'My Timeline' : 'Milestones & Logs'}
                        </button>
                        
                        {showFinance && !isUserView && (
                          <>
                            <button type="button" onClick={() => setModalTab('opex')} disabled={!selectedProject} className={`text-left px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-3 ${!selectedProject ? 'opacity-30 cursor-not-allowed' : modalTab === 'opex' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}`}>
                               <Zap className="h-5 w-5 opacity-70" /> Operational Expenses
                            </button>
                            <button type="button" onClick={() => setModalTab('finance')} disabled={!selectedProject} className={`text-left px-4 py-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-3 ${!selectedProject ? 'opacity-30 cursor-not-allowed' : modalTab === 'finance' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}`}>
                               <PieChart className="h-5 w-5 opacity-70" /> Budget & Finances
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-w-0 bg-white relative">
                  
                  <div className="px-6 sm:px-10 py-5 sm:py-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                     <h3 className="text-xl font-bold text-slate-800 tracking-tight">{getTabTitle(modalTab)}</h3>
                     <button type="button" onClick={handleCloseModal} className="h-9 w-9 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors shrink-0 shadow-sm"><X className="h-4 w-4" /></button>
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain p-6 sm:p-10 flex flex-col">
                     
                    {modalTab === 'details' && (
                      <div className="max-w-4xl w-full mx-auto space-y-8">
                        {isUserView ? (
                           <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 space-y-8 shadow-sm">
                             <div>
                               <h2 className="text-2xl font-bold text-slate-900">{formData.name}</h2>
                               <p className="text-sm text-slate-600 mt-3 leading-relaxed">{formData.description || 'No detailed description provided for this project.'}</p>
                             </div>

                             <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6 border-t border-slate-200">
                               <div>
                                 <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Client</p>
                                 <p className="text-sm font-medium text-slate-900">{customerType === 'existing' ? customers.find(c => c.id?.toString() === formData.customer_id?.toString())?.name : 'Internal Node'}</p>
                               </div>
                               <div>
                                 <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Due Date</p>
                                 <p className="text-sm font-medium text-slate-900">{formData.due_date ? new Date(formData.due_date).toLocaleDateString() : 'TBD'}</p>
                               </div>
                               <div>
                                 <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Priority</p>
                                 <div className="flex items-center gap-1.5">
                                   <div className={`h-2.5 w-2.5 rounded-full ${formData.priority === 'High' ? 'bg-red-500' : formData.priority === 'Medium' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                                   <p className="text-sm font-medium text-slate-900">{formData.priority}</p>
                                 </div>
                               </div>
                             </div>

                             <div className="pt-6 border-t border-slate-200">
                                <h4 className="text-sm font-bold text-slate-900 mb-4">Resource Hub</h4>
                                {formData.resource_links.length === 0 ? (
                                   <p className="text-sm text-slate-500 italic">No resources added.</p>
                                ) : (
                                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                     {formData.resource_links.map(link => {
                                        const rType = RESOURCE_TYPES.find(r => r.id === link.type) || RESOURCE_TYPES[4];
                                        return (
                                          <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md ${rType.bg}`}>
                                             <div className={`h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-sm ${rType.color}`}>
                                                <rType.icon className="h-5 w-5" />
                                             </div>
                                             <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-slate-900 truncate">{link.title}</p>
                                                <p className={`text-xs font-medium uppercase tracking-wider mt-0.5 ${rType.color}`}>{rType.label}</p>
                                             </div>
                                             <ExternalLink className="h-4 w-4 text-slate-400 shrink-0" />
                                          </a>
                                        )
                                     })}
                                   </div>
                                )}
                             </div>
                           </div>
                        ) : (
                          <>
                           <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-5">
                               <div>
                                  <h4 className="text-base font-bold text-slate-900">Client Integration</h4>
                                  <p className="text-sm text-slate-500 mt-0.5">Link project to a customer or internal node.</p>
                               </div>
                               <div className="flex bg-slate-50 rounded-lg p-1 w-full sm:w-auto border border-slate-200">
                                 <button type="button" onClick={() => setCustomerType('existing')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${customerType === 'existing' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'}`}>Existing</button>
                                 <button type="button" onClick={() => setCustomerType('new')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${customerType === 'new' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'}`}>New</button>
                                 <button type="button" onClick={() => setCustomerType('in_house')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${customerType === 'in_house' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'}`}>In-House</button>
                               </div>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                               <div>
                                 <label className="block text-sm font-semibold text-slate-700 mb-2">Owning Subsidiary <span className="text-red-500">*</span></label>
                                 <select value={formData.company_id} onChange={(e) => setFormData({...formData, company_id: e.target.value, customer_id: "", internal_company_id: "", assignee_ids: []})} disabled={!isGlobalAdmin} className="block w-full h-11 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-50 disabled:text-slate-500 bg-white transition-all">
                                   <option value="" disabled>Select Company...</option>
                                   {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                 </select>
                               </div>

                               <div>
                                 {customerType === 'existing' && (
                                   <><label className="block text-sm font-semibold text-slate-700 mb-2">Customer / Client <span className="text-red-500">*</span></label>
                                   <select value={formData.customer_id} onChange={(e) => setFormData({...formData, customer_id: e.target.value, internal_company_id: ""})} disabled={!formData.company_id} className="block w-full h-11 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-50 disabled:text-slate-500 bg-white transition-all">
                                     <option value="">-- Select Client --</option>
                                     {availableCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                   </select></>
                                 )}
                                 {customerType === 'new' && (
                                   <><label className="block text-sm font-semibold text-slate-700 mb-2">New Client <span className="text-red-500">*</span></label>
                                   <div className="grid grid-cols-2 gap-3">
                                     <input type="text" placeholder="Client Name *" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} className="block w-full h-11 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-50 bg-white transition-all" />
                                     <input type="text" placeholder="Phone (Optional)" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} className="block w-full h-11 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-50 bg-white transition-all" />
                                   </div></>
                                 )}
                                 {customerType === 'in_house' && (
                                   <><label className="block text-sm font-semibold text-slate-700 mb-2">Internal Target <span className="text-red-500">*</span></label>
                                   <select value={formData.internal_company_id} onChange={(e) => setFormData({...formData, internal_company_id: e.target.value, customer_id: ""})} className="block w-full h-11 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-50 disabled:text-slate-500 bg-blue-50 text-blue-900 transition-all">
                                     <option value="">-- Select Subsidiary --</option>
                                     {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                   </select></>
                                 )}
                               </div>
                             </div>
                           </div>

                           <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                             <div className="flex flex-col xl:flex-row gap-6 mb-6">
                               <div className="flex-1">
                                 <label className="block text-sm font-semibold text-slate-700 mb-2">Project Name <span className="text-red-500">*</span></label>
                                 <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="block w-full h-11 rounded-lg border-slate-200 border px-4 text-sm font-medium focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-50 bg-white transition-all" />
                               </div>
                               
                               {showFinance && !isUserView && (
                                 <div className="w-full xl:w-[420px] shrink-0">
                                   <label className="block text-sm font-semibold text-slate-700 mb-2">Expected Value (₹)</label>
                                   <div className="flex gap-3 items-center">
                                     <div className="relative flex-1">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-medium">₹</span>
                                        <input type="number" value={formData.expected_amount} onChange={(e) => setFormData({...formData, expected_amount: parseFloat(e.target.value) || 0})} className="block w-full h-11 rounded-lg border-slate-200 border pl-8 pr-4 text-sm font-bold focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-100 bg-slate-50 transition-all" />
                                     </div>
                                     {selectedProject && !invoices.some((inv: any) => inv.project_id === selectedProject.id) && (
                                       <button type="button" onClick={handleGenerateInvoice} disabled={isSaving} className="shrink-0 px-5 h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-all shadow-md flex items-center justify-center">
                                           Approve Invoice
                                       </button>
                                     )}
                                   </div>
                                 </div>
                               )}
                             </div>

                             <div className="mb-6">
                               {!showDescription && !formData.description ? (
                                 <button type="button" onClick={() => setShowDescription(true)} className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                                   <Plus className="h-4 w-4" /> Add Project Description
                                 </button>
                               ) : (
                                 <div className="animate-in fade-in slide-in-from-top-2">
                                   <div className="flex items-center justify-between mb-2">
                                     <label className="block text-sm font-semibold text-slate-700">Description</label>
                                     <button type="button" onClick={() => { setShowDescription(false); setFormData({...formData, description: ""}); }} className="text-slate-400 hover:text-red-500 transition-colors" title="Remove Description">
                                       <X className="h-4 w-4" />
                                     </button>
                                   </div>
                                   <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="block w-full h-24 rounded-lg border-slate-200 border p-3 text-sm focus:border-blue-500 outline-none shadow-sm resize-none disabled:bg-slate-50 bg-white transition-all" placeholder="Briefly describe the project goals or scope..." />
                                 </div>
                               )}
                             </div>

                             <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
                               <div><label className="block text-sm font-semibold text-slate-700 mb-2">Priority</label><select value={formData.priority} onChange={(e) => setFormData({...formData, priority: e.target.value})} className="block w-full h-11 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-50 bg-white"><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option></select></div>
                               <div><label className="block text-sm font-semibold text-slate-700 mb-2">Approval Date</label><input type="date" value={formData.approval_date} onChange={(e) => setFormData({...formData, approval_date: e.target.value})} className="block w-full h-11 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-50 bg-white" /></div>
                               <div><label className="block text-sm font-semibold text-slate-700 mb-2">Due Date</label><input type="date" value={formData.due_date} onChange={(e) => setFormData({...formData, due_date: e.target.value})} className="block w-full h-11 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-50 bg-white" /></div>
                             </div>
                           </div>

                           <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm">
                             <div className="flex items-center justify-between mb-5">
                               <div>
                                 <h4 className="text-base font-bold text-slate-900">Resource Hub</h4>
                                 <p className="text-sm text-slate-500 mt-0.5">Attach Drive folders, GitHub repos, Figma files, and links.</p>
                               </div>
                               <button type="button" onClick={() => setShowResourceForm(!showResourceForm)} className="h-9 px-4 bg-white border border-slate-200 text-slate-700 hover:text-blue-600 hover:border-blue-200 rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2">
                                 {showResourceForm ? 'Cancel' : <><Plus className="h-4 w-4"/> Add Link</>}
                               </button>
                             </div>

                             <AnimatePresence>
                               {showResourceForm && (
                                 <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-5">
                                   <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm flex flex-col md:flex-row gap-3">
                                      <select value={newResource.type} onChange={(e) => setNewResource({...newResource, type: e.target.value})} className="h-10 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none w-full md:w-40">
                                         {RESOURCE_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                      </select>
                                      <input type="text" placeholder="Title (e.g., Marketing Assets)" value={newResource.title} onChange={e => setNewResource({...newResource, title: e.target.value})} className="flex-1 h-10 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none" />
                                      <input type="url" placeholder="https://..." value={newResource.url} onChange={e => setNewResource({...newResource, url: e.target.value})} className="flex-1 h-10 rounded-lg border-slate-200 border px-3 text-sm focus:border-blue-500 outline-none" />
                                      <button type="button" onClick={() => {
                                        if(!newResource.title || !newResource.url) return setCustomAlert({title: "Missing Info", message: "Title and URL are required.", type: 'error'});
                                        setFormData({...formData, resource_links: [...formData.resource_links, { ...newResource, id: crypto.randomUUID() }]});
                                        setNewResource({ title: "", url: "", type: "website" });
                                        setShowResourceForm(false);
                                      }} className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm w-full md:w-auto transition-colors">Add</button>
                                   </div>
                                 </motion.div>
                               )}
                             </AnimatePresence>

                             <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                               {formData.resource_links.length === 0 && !showResourceForm && (
                                 <div className="col-span-full py-6 text-center text-slate-500 text-sm italic border border-dashed border-slate-300 rounded-xl bg-white">No external resources added.</div>
                               )}
                               {formData.resource_links.map(link => {
                                 const rType = RESOURCE_TYPES.find(r => r.id === link.type) || RESOURCE_TYPES[4];
                                 return (
                                   <div key={link.id} className={`flex items-center gap-3 p-3 rounded-xl border relative group ${rType.bg}`}>
                                      <a href={link.url} target="_blank" rel="noopener noreferrer" className={`h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-sm hover:scale-105 transition-transform ${rType.color}`}>
                                         <rType.icon className="h-5 w-5" />
                                      </a>
                                      <div className="flex-1 min-w-0 pr-6">
                                         <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-slate-900 truncate hover:underline block">{link.title}</a>
                                         <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${rType.color}`}>{rType.label}</p>
                                      </div>
                                      <button type="button" onClick={() => setFormData({...formData, resource_links: formData.resource_links.filter(l => l.id !== link.id)})} className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-red-500 bg-white rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                   </div>
                                 )
                               })}
                             </div>
                           </div>
                          </>
                        )}
                      </div>
                    )}

                    {modalTab === 'team' && (
                      <div className="max-w-5xl mx-auto w-full space-y-8">
                         <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                            <label className="block text-lg font-bold text-slate-900 mb-6">Assign Team Members to Project</label>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                              {availableEmployees.length === 0 ? <p className="text-sm text-slate-500 italic col-span-full">No available employees to assign.</p> : null}
                              {availableEmployees.map(emp => {
                                const isSelected = formData.assignee_ids.includes(emp.id);
                                return (
                                  <button type="button" key={emp.id} onClick={() => { if (isSelected) setFormData({...formData, assignee_ids: formData.assignee_ids.filter(id => id !== emp.id)}); else setFormData({...formData, assignee_ids: [...formData.assignee_ids, emp.id]}); }} className={`flex items-center gap-3 p-3 rounded-lg border text-sm font-semibold transition-all shadow-sm ${isSelected ? 'bg-blue-600 text-white border-transparent shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'}`}>
                                     {emp.profile_image_url ? <img src={emp.profile_image_url} alt="" className="h-8 w-8 rounded-full object-cover shadow-sm bg-white" /> : <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><User className="h-4 w-4" /></div>} 
                                     <span className="truncate">{emp.name}</span>
                                  </button>
                                )
                              })}
                            </div>
                         </div>
                      </div>
                    )}

                    {modalTab === 'tasks' && (
                      <div className="w-full flex flex-col h-full gap-6 max-w-5xl mx-auto">
                        {isAdminView && (
                          <div className="flex flex-col xl:flex-row gap-4 shrink-0 bg-white p-6 border border-slate-200 rounded-xl shadow-sm">
                            <input 
                              type="text" 
                              placeholder="New task title..." 
                              value={newTaskTitle} 
                              onChange={(e) => setNewTaskTitle(e.target.value)} 
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (newTaskTitle.trim() !== "" && newTaskAssignee !== "") handleAddTask();
                                }
                              }} 
                              className="flex-1 h-11 rounded-lg border border-slate-200 px-4 text-sm font-medium focus:border-blue-500 outline-none shadow-sm bg-white transition-all" 
                            />
                            <div className="flex gap-3 w-full xl:w-auto">
                              <input 
                                type="date" 
                                title="Optional Task Deadline" 
                                value={newTaskDeadline} 
                                max={formData.due_date || undefined}
                                onChange={(e) => {
                                  if (formData.due_date && new Date(e.target.value) > new Date(formData.due_date)) {
                                    setCustomAlert({ title: "Invalid Deadline", message: `Task deadline cannot exceed the project's main due date (${formData.due_date}).`, type: "error" });
                                    return;
                                  }
                                  setNewTaskDeadline(e.target.value);
                                }} 
                                className="w-full sm:w-40 h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium focus:border-blue-500 outline-none shadow-sm bg-white text-slate-600 transition-all" 
                              />
                              <select 
                                value={newTaskAssignee} 
                                onChange={(e) => setNewTaskAssignee(e.target.value ? parseInt(e.target.value) : "")} 
                                className="w-full sm:w-48 h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium focus:border-blue-500 outline-none bg-white shadow-sm cursor-pointer text-slate-700 transition-all"
                              >
                                <option value="" disabled>-- Select Assignee --</option>
                                {(formData.assignee_ids || []).map(id => <option key={id} value={id}>{getAvatar(id)?.name || 'Unknown'}</option>)}
                              </select>

                              <AnimatePresence>
                                {newTaskTitle.trim() !== "" && newTaskAssignee !== "" && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.5, width: 0, marginLeft: -12 }}
                                    animate={{ opacity: 1, scale: 1, width: 'auto', marginLeft: 0 }}
                                    exit={{ opacity: 0, scale: 0.5, width: 0, marginLeft: -12 }}
                                    className="shrink-0 overflow-hidden flex items-center"
                                  >
                                    <button type="button" onClick={handleAddTask} className="cursor-pointer h-11 w-14 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center font-bold shadow-md transition-all">
                                      <Plus className="h-5 w-5" />
                                    </button>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        )}

                        <div className="flex-1 overflow-y-auto space-y-3 min-h-0 bg-white p-6 border border-slate-200 rounded-xl shadow-sm">
                          <h4 className="text-base font-bold text-slate-900 mb-4">Task List</h4>
                          {displayTasks.length === 0 ? (
                            <div className="h-32 flex flex-col items-center justify-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              <p className="text-sm font-medium">No tasks added</p>
                            </div>
                          ) : (
                            displayTasks.map((task, index) => {
                              const deadlineStat = !task.is_completed ? getDueDateStatus(task.deadline) : null;
                              const isMyTask = task.assignee_id === employeeId || !task.assignee_id;
                              
                              const taskKey = task.id || task.tempId || index;
                              const isEditingTask = editingTaskKey === taskKey;

                              return isEditingTask ? (
                                 <div key={taskKey} className="flex flex-col sm:flex-row gap-3 w-full p-4 bg-blue-50/50 rounded-xl border border-blue-100 shadow-sm animate-in fade-in">
                                    <input type="text" value={editTaskForm.title} onChange={e => setEditTaskForm({...editTaskForm, title: e.target.value})} className="flex-1 h-10 rounded-lg border border-blue-200 px-3 text-sm font-semibold outline-none focus:border-blue-600 bg-white" placeholder="Task title..." />
                                    <select value={editTaskForm.assignee_id} onChange={e => setEditTaskForm({...editTaskForm, assignee_id: e.target.value})} className="w-full sm:w-40 h-10 rounded-lg border border-blue-200 px-3 text-sm font-semibold outline-none focus:border-blue-600 bg-white">
                                      <option value="" disabled>-- Assignee --</option>
                                      {(formData.assignee_ids || []).map(id => <option key={id} value={id}>{getAvatar(id)?.name || 'Unknown'}</option>)}
                                    </select>
                                    <input type="date" value={editTaskForm.deadline} onChange={e => setEditTaskForm({...editTaskForm, deadline: e.target.value})} className="w-full sm:w-40 h-10 rounded-lg border border-blue-200 px-3 text-sm font-semibold outline-none focus:border-blue-600 bg-white" />
                                    <div className="flex gap-2 shrink-0 items-center justify-end w-full sm:w-auto">
                                        <button type="button" onClick={() => setEditingTaskKey(null)} className="h-10 px-4 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-white transition-colors border border-blue-200">Cancel</button>
                                        <button type="button" onClick={() => handleSaveTaskEdit(task)} disabled={isSaving} className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 shadow-md">Save</button>
                                    </div>
                                 </div>
                              ) : (
                                <div key={taskKey} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all ${task.is_completed ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200 shadow-sm group hover:border-slate-300'}`}>
                                  <div className="flex items-start gap-4 min-w-0 flex-1">
                                    <div onClick={() => {
                                        if (isAdminView) {
                                          if (task.id) {
                                            if (!task.assignee_id) {
                                              setCustomAlert({ title: "Unassigned Task", message: "Please assign this task to a team member before tracking its completion.", type: "error" });
                                            } else {
                                              setTaskRedirectPrompt(task);
                                            }
                                          } else {
                                            handleAdminToggleTask(task, index);
                                          }
                                        }
                                      }} 
                                      className={`mt-0.5 h-6 w-6 rounded flex items-center justify-center shrink-0 transition-colors ${isAdminView ? 'cursor-pointer hover:border-green-500' : 'opacity-70'} ${task.is_completed ? 'bg-green-500 border-green-500' : 'bg-white border border-slate-300 shadow-sm'}`}
                                    >
                                      {task.is_completed && <Check className="h-4 w-4 text-white" />}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-semibold leading-relaxed break-words ${task.is_completed ? 'text-slate-500' : 'text-slate-900'}`}>{task.title}</p>
                                      <div className="flex flex-wrap items-center gap-3 mt-2.5">
                                        {task.assignee_id && <span className="text-xs font-bold text-blue-600 uppercase tracking-wider truncate border border-blue-100 bg-blue-50 px-2 py-0.5 rounded">{getAvatar(task.assignee_id)?.name}</span>}
                                        
                                        {deadlineStat && (
                                          <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded border ${deadlineStat.style}`}>
                                            <div className={`h-1.5 w-1.5 rounded-full ${deadlineStat.dot}`} /> {deadlineStat.label}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                     {isUserView && isMyTask && (
                                       <button type="button" onClick={() => { setTaskToUpload(task); setIsUploadModalOpen(true); }} className={`w-full sm:w-auto h-10 rounded-lg px-5 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider shadow-sm transition-colors ${task.is_completed ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                         <UploadCloud className="h-4 w-4" /> {task.is_completed ? 'Add More Files' : 'Upload Work'}
                                       </button>
                                     )}
                                     
                                     {isAdminView && (
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                           <button type="button" onClick={() => { setEditingTaskKey(taskKey); setEditTaskForm({ title: task.title, assignee_id: task.assignee_id || "", deadline: task.deadline || "" }); }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 className="h-4 w-4" /></button>
                                           <button type="button" onClick={() => handleDeleteTask(task)} className="p-2 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                     )}
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>

                      </div>
                    )}

                    {modalTab === 'progress' && (
                      <div className="w-full flex flex-col h-full gap-6 max-w-5xl mx-auto">

                        {isAdminView && (
                          <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 shadow-sm">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-100 pb-5">
                              <div>
                                <h4 className="text-lg font-bold text-slate-900">Project Milestones</h4>
                                <p className="text-sm text-slate-500 mt-1">Check prerequisites to automatically adjust project status.</p>
                              </div>
                              <div className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm border ${getStatusStyle(formData.status)}`}>
                                {formData.status}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">To "In Progress"</h5>
                                <div className="space-y-4">
                                  {Object.entries({ drive_created: "Drive Folder Created", team_briefed: "Team Briefed", budget_cleared: "Budget Cleared" }).map(([key, label]) => (
                                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                                      <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors shadow-sm ${formData.milestones?.in_progress?.[key as keyof typeof formData.milestones.in_progress] ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                                        {formData.milestones?.in_progress?.[key as keyof typeof formData.milestones.in_progress] && <Check className="h-3.5 w-3.5 text-white" />}
                                      </div>
                                      <span className={`text-sm font-semibold ${formData.milestones?.in_progress?.[key as keyof typeof formData.milestones.in_progress] ? 'text-slate-400' : 'text-slate-900'}`}>{label}</span>
                                      <input type="checkbox" className="hidden" checked={!!formData.milestones?.in_progress?.[key as keyof typeof formData.milestones.in_progress]} onChange={() => handleMilestoneToggle('in_progress', key)} />
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">To "Review"</h5>
                                <div className="space-y-4">
                                  {Object.entries({ all_tasks_done: "All Tasks Completed", internal_qa: "Internal QA Passed" }).map(([key, label]) => (
                                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                                      <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors shadow-sm ${formData.milestones?.review?.[key as keyof typeof formData.milestones.review] ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                                        {formData.milestones?.review?.[key as keyof typeof formData.milestones.review] && <Check className="h-3.5 w-3.5 text-white" />}
                                      </div>
                                      <span className={`text-sm font-semibold ${formData.milestones?.review?.[key as keyof typeof formData.milestones.review] ? 'text-slate-400' : 'text-slate-900'}`}>{label}</span>
                                      <input type="checkbox" className="hidden" checked={!!formData.milestones?.review?.[key as keyof typeof formData.milestones.review]} onChange={() => handleMilestoneToggle('review', key)} />
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">To "Completed"</h5>
                                <div className="space-y-4">
                                  {Object.entries({ client_approved: "Client Approved", final_handover: "Final Handover" }).map(([key, label]) => (
                                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                                      <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors shadow-sm ${formData.milestones?.completed?.[key as keyof typeof formData.milestones.completed] ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                                        {formData.milestones?.completed?.[key as keyof typeof formData.milestones.completed] && <Check className="h-3.5 w-3.5 text-white" />}
                                      </div>
                                      <span className={`text-sm font-semibold ${formData.milestones?.completed?.[key as keyof typeof formData.milestones.completed] ? 'text-slate-400' : 'text-slate-900'}`}>{label}</span>
                                      <input type="checkbox" className="hidden" checked={!!formData.milestones?.completed?.[key as keyof typeof formData.milestones.completed]} onChange={() => handleMilestoneToggle('completed', key)} />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {isUserView ? (
                           <>
                             <div className="flex flex-col shrink-0 bg-white p-6 border border-slate-200 rounded-xl shadow-sm mb-8">
                               <p className="text-base font-bold text-slate-900 mb-4">Add New Log Entry</p>
                               <textarea value={myReportText} onChange={e => setMyReportText(e.target.value)} placeholder="Type your latest progress update here..." className="w-full h-24 rounded-lg border border-slate-300 bg-white p-4 text-sm outline-none focus:border-blue-600 transition-all resize-none mb-4 shadow-sm" />
                               <div className="flex flex-col sm:flex-row justify-end gap-3">
                                 <button type="button" onClick={() => {
                                    if (formData.resource_links.length === 0) {
                                       setCustomAlert({ title: "No Drive Link", message: "There are no resource links for this project. Please contact your administrator.", type: 'error' });
                                       return;
                                    }
                                    setTaskToUpload({ title: "General Document Upload", id: "general" });
                                    setIsUploadModalOpen(true);
                                 }} className="w-full sm:w-auto bg-white border border-slate-300 text-slate-700 rounded-lg h-11 px-5 text-sm font-semibold shadow-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
                                   <UploadCloud className="h-4 w-4" /> Upload Document
                                 </button>
                                 <button type="button" onClick={handleSaveMyReport} disabled={isSaving || !myReportText.trim()} className="w-full sm:w-auto bg-blue-600 text-white rounded-lg h-11 px-8 text-sm font-semibold shadow-md hover:bg-blue-700 transition-all disabled:opacity-50">
                                   {isSaving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Submit Update"}
                                 </button>
                               </div>
                             </div>

                             <div className="pt-2">
                               <h4 className="text-lg font-bold text-slate-900 mb-5 border-b border-slate-200 pb-3">My Previous Updates</h4>

                               <div className="space-y-5">
                                 {myEntries.map((entry: any) => {
                                   const isEditing = editingEntryId === entry.id;
                                   const hasReaction = !!entry.reaction;
                                   const visual = getReactionVisuals(entry.reaction?.status);

                                   return (
                                     <div key={entry.id} className="relative">
                                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative group transition-all hover:border-slate-300 z-10">
                                           {!isEditing && (
                                              <div className="absolute top-4 right-4 flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
                                                 <button type="button" onClick={() => { setEditingEntryId(entry.id); setEditingEntryText(entry.text); }} className="p-2 text-slate-500 hover:text-blue-600 bg-slate-50 border border-slate-200 rounded-md transition-colors"><Edit2 className="h-4 w-4" /></button>
                                                 <button type="button" onClick={() => handleDeleteEntry(employeeId, entry.id)} className="p-2 text-slate-500 hover:text-red-600 bg-slate-50 border border-slate-200 rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
                                              </div>
                                           )}

                                           {entry.type === 'upload' && (
                                             <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold uppercase tracking-wider rounded mb-4 shadow-sm">
                                                <FileText className="h-4 w-4" /> Attached File: {entry.task_title}
                                             </span>
                                           )}

                                           {isEditing ? (
                                              <div className="mt-2">
                                                 <textarea value={editingEntryText} onChange={e => setEditingEntryText(e.target.value)} className="w-full h-24 rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm outline-none focus:border-blue-600 mb-3 resize-none shadow-sm" />
                                                 <div className="flex justify-end gap-3">
                                                    <button type="button" onClick={() => setEditingEntryId(null)} className="px-5 py-2 rounded-lg text-sm font-semibold text-slate-600 border border-slate-300 bg-white hover:bg-slate-50 transition-colors shadow-sm">Cancel</button>
                                                    <button type="button" onClick={() => handleEditUserEntry(entry.id)} disabled={isSaving} className="px-6 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-md">{isSaving ? 'Saving...' : 'Save'}</button>
                                                 </div>
                                              </div>
                                           ) : (
                                              <p className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed pr-16">{entry.text}</p>
                                           )}
                                           <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-5 block">{new Date(entry.timestamp).toLocaleString()}</span>
                                        </div>

                                        {hasReaction && (
                                           <div className="ml-6 sm:ml-10 mt-3 relative">
                                              <CornerDownRight className="absolute -left-6 top-3 h-6 w-6 text-slate-300" />
                                              <div className={`p-4 rounded-lg border shadow-sm ${visual.bg} ${visual.border}`}>
                                                 <span className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${visual.text} mb-2`}>
                                                    <visual.icon className="h-4 w-4" /> {entry.reaction.status}
                                                 </span>
                                                 {entry.reaction.text && <p className={`text-sm ${visual.text} opacity-90 leading-relaxed`}>{entry.reaction.text}</p>}
                                              </div>
                                           </div>
                                        )}
                                     </div>
                                   )
                                 })}

                                 {myReport?.report_text && myEntries.length === 0 && (
                                   <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                     {myReport.report_text}
                                   </pre>
                                 )}

                                 {myEntries.length === 0 && !myReport?.report_text && (
                                   <p className="text-sm italic text-slate-500 py-6">No updates submitted yet.</p>
                                 )}
                               </div>
                             </div>
                           </>
                         ) : (
                           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                             {(formData.assignee_ids || []).length === 0 && <p className="text-sm text-slate-500 italic md:col-span-2">No team members assigned.</p>}

                             {(formData.assignee_ids || []).map(empId => {
                               const emp = getAvatar(empId);
                               const empReport = reports.find(r => r.project_id?.toString() === selectedProject?.id?.toString() && r.employee_id?.toString() === empId?.toString());
                               
                               const noteCount = Array.isArray(empReport?.entries) ? empReport.entries : [];

                               return (
                                 <div key={empId} className="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-8 shadow-sm flex flex-col items-center text-center transition-all group">
                                   <div className="h-20 w-20 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-2xl font-bold text-slate-600 overflow-hidden shrink-0 mb-5 shadow-sm">
                                      {emp?.profile_image_url ? <img src={emp.profile_image_url} alt="" className="h-full w-full object-cover" /> : (emp?.name || 'U').charAt(0).toUpperCase()}
                                   </div>
                                   <p className="text-lg font-bold text-slate-900">{emp?.name}</p>
                                   <p className="text-xs font-bold text-slate-400 mt-2 mb-6 uppercase tracking-widest">{noteCount} Updates Logged</p>

                                   <button type="button" onClick={() => setTimelineModalEmpId(empId)} className="w-full py-3 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm">
                                     View Timeline
                                   </button>
                                 </div>
                               )
                             })}
                           </div>
                         )}
                      </div>
                    )}

                    {/* OPEX TAB */}
                    {showFinance && modalTab === 'opex' && (
                      <div className="w-full flex flex-col h-full gap-6 max-w-5xl mx-auto">
                        <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 shadow-sm">
                           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100">
                              <div>
                                 <h4 className="text-lg font-bold text-slate-900">Operational Expenses (OpEx)</h4>
                                 <p className="text-sm text-slate-500 mt-1 font-medium">Track non-team project expenses (software, travel, materials).</p>
                              </div>
                              <div className="text-right bg-rose-50 border border-rose-100 px-4 py-2 rounded-lg">
                                 <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">Total Expenses</p>
                                 <p className="text-xl font-black text-rose-700">₹{totalOpEx.toLocaleString()}</p>
                              </div>
                           </div>

                           <div className="flex flex-col md:flex-row gap-4 items-end mb-8 bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm">
                              <div className="w-full md:w-1/4">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">Category</label>
                                <select value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value})} className="block w-full h-11 rounded-lg border-slate-300 px-4 text-sm font-medium focus:border-blue-500 outline-none bg-white">
                                  <option value="Software & Tools">Software & Tools</option>
                                  <option value="Travel & Logistics">Travel & Logistics</option>
                                  <option value="Materials & Assets">Materials & Assets</option>
                                  <option value="Consulting/External">Consulting/External</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>
                              <div className="flex-1 w-full">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">Description</label>
                                <input type="text" placeholder="E.g., Vercel Hosting..." value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} className="block w-full h-11 rounded-lg border-slate-300 px-4 text-sm font-medium focus:border-blue-500 outline-none bg-white" />
                              </div>
                              <div className="w-full md:w-32">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">Amount (₹)</label>
                                <input type="number" placeholder="0" value={newExpense.amount || ''} onChange={e => setNewExpense({...newExpense, amount: parseFloat(e.target.value) || 0})} className="block w-full h-11 rounded-lg border-slate-300 px-4 text-sm font-bold focus:border-blue-500 outline-none bg-white" />
                              </div>
                              <button type="button" onClick={handleAddExpense} disabled={isSaving || !selectedProject} className="w-full md:w-auto h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-md">Add</button>
                           </div>

                           <div className="space-y-3">
                             {projectExpenses.length === 0 ? (
                               <p className="text-sm text-slate-500 italic py-6 text-center border border-dashed border-slate-200 rounded-xl">No expenses recorded for this project.</p>
                             ) : (
                               projectExpenses.map(expense => (
                                 <div key={expense.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors shadow-sm group">
                                    <div className="flex items-center gap-4">
                                      <div className="h-10 w-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
                                        <Briefcase className="h-5 w-5" />
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-slate-900">{expense.description}</p>
                                        <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">{expense.category} • {new Date(expense.expense_date).toLocaleDateString()}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4 mt-3 sm:mt-0">
                                      <span className="text-base font-black text-rose-700">₹{parseFloat(expense.amount).toLocaleString()}</span>
                                      <button type="button" onClick={() => handleDeleteExpense(expense.id)} className="p-2 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-50 rounded-md border border-slate-200"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                 </div>
                               ))
                             )}
                           </div>
                        </div>
                      </div>
                    )}

                    {/* FINANCE TAB */}
                    {showFinance && modalTab === 'finance' && (
                      <div className="w-full flex flex-col h-full gap-8 max-w-5xl mx-auto">
                        
                        {formData.milestones.completed.client_approved && invoices.filter((i:any) => i.project_id === selectedProject?.id && i.status === 'Paid').length > 0 && (
                           <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-center gap-4 shadow-sm animate-in fade-in slide-in-from-top-4">
                              <div className="h-10 w-10 bg-blue-600 text-white rounded-full flex items-center justify-center shrink-0">
                                <CheckCircle2 className="h-5 w-5" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-blue-900">Milestone Reached: Client Approved</h4>
                                <p className="text-xs font-medium text-blue-700 mt-1">The client has approved this project and invoices are cleared. You can disburse the final payment tranches to your team below.</p>
                              </div>
                           </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-center">
                              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Project Expected Value</h4>
                              <p className="text-4xl font-black text-slate-900 tracking-tight">₹{(formData.expected_amount || 0).toLocaleString()}</p>
                           </div>
                           
                           <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                              <div className="flex justify-between items-end mb-4">
                                <div>
                                   <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Profit Margin & Burn</h4>
                                   <div className="flex items-center gap-3 mt-2">
                                     <span className={`text-2xl font-black ${grossMargin < 0 ? 'text-red-600' : 'text-green-600'}`}>₹{grossMargin.toLocaleString()}</span>
                                     <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${grossMargin < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{marginPercent}% Margin</span>
                                   </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Costs (Team + OpEx)</p>
                                  <p className="text-lg font-bold text-slate-800">₹{totalCosts.toLocaleString()}</p>
                                </div>
                              </div>
                              
                              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                                <div className="h-full bg-blue-600 transition-all" style={{ width: `${formData.expected_amount > 0 ? Math.min((totalAllocations / formData.expected_amount) * 100, 100) : 0}%` }} title="Team Allocations"></div>
                                <div className="h-full bg-slate-600 transition-all" style={{ width: `${formData.expected_amount > 0 ? Math.min((totalOpEx / formData.expected_amount) * 100, 100) : 0}%` }} title="Operational Expenses"></div>
                              </div>
                              <div className="flex gap-4 mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                                <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-blue-600"></div> Team (₹{totalAllocations.toLocaleString()})</div>
                                <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-slate-600"></div> OpEx (₹{totalOpEx.toLocaleString()})</div>
                              </div>
                           </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-5 border-b border-slate-100">
                              <div>
                                 <h4 className="text-xl font-bold text-slate-900">Resource Allocation</h4>
                                 <p className="text-sm text-slate-500 mt-1 font-medium">Set fixed budgets and performance incentives for assigned members.</p>
                              </div>
                              <button type="button" onClick={handleSaveAllocations} disabled={isSaving || !hasAllocationChanges} className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all shadow-md hover:bg-blue-700 w-full sm:w-auto">
                                 {isSaving ? 'Saving...' : 'Save Allocations'}
                              </button>
                           </div>
                           
                           {(formData.assignee_ids || []).length === 0 ? (
                              <p className="text-sm text-slate-500 italic text-center py-8 border border-dashed border-slate-300 rounded-xl bg-slate-50">Assign team members in the "Team" tab to establish their budgets.</p>
                           ) : (
                              <div className="space-y-5">
                                 {(formData.assignee_ids || []).map(empId => {
                                    const emp = getAvatar(empId);
                                    const alloc = allocationsForm[empId] || { allocated: 0, incentive: 0 };
                                    const total = Number(alloc.allocated) + Number(alloc.incentive);
                                    return (
                                       <div key={empId} className="flex flex-col md:flex-row md:items-center gap-6 p-5 bg-slate-50 border border-slate-200 rounded-xl shadow-sm">
                                          <div className="flex items-center gap-4 w-full md:w-1/3 shrink-0">
                                             <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center text-sm font-bold text-slate-600 overflow-hidden ring-1 ring-slate-200 shadow-sm">
                                                {emp?.profile_image_url ? <img src={emp.profile_image_url} alt="" className="h-full w-full object-cover"/> : (emp?.name || 'U').charAt(0)}
                                             </div>
                                             <div>
                                                <span className="text-sm font-bold text-slate-900 block truncate">{emp?.name || 'Unknown'}</span>
                                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">Assigned Resource</span>
                                             </div>
                                          </div>
                                          <div className="flex flex-col sm:flex-row flex-1 items-center gap-5">
                                             <div className="flex-1 w-full">
                                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">Base Package</label>
                                                <div className="relative">
                                                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-semibold">₹</span>
                                                  <input type="number" value={alloc.allocated || ''} onChange={(e) => setAllocationsForm({...allocationsForm, [empId]: { ...alloc, allocated: parseFloat(e.target.value) || 0 }})} className="block w-full h-11 pl-8 pr-3 rounded-lg border-slate-300 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 border bg-white shadow-sm transition-all" placeholder="0" />
                                                </div>
                                             </div>
                                             <div className="flex-1 w-full">
                                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">Incentive</label>
                                                <div className="relative">
                                                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-semibold">₹</span>
                                                  <input type="number" value={alloc.incentive || ''} onChange={(e) => setAllocationsForm({...allocationsForm, [empId]: { ...alloc, incentive: parseFloat(e.target.value) || 0 }})} className="block w-full h-11 pl-8 pr-3 rounded-lg border-slate-300 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 border bg-white shadow-sm transition-all" placeholder="0" />
                                                </div>
                                             </div>
                                             <div className="w-full sm:w-32 sm:text-right pt-4 shrink-0 sm:border-l sm:border-slate-200 sm:pl-5">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Max Cap</label>
                                                <span className="text-base font-black text-slate-900">₹{total.toLocaleString()}</span>
                                             </div>
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           )}
                        </div>

                        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                           <div className="mb-6 pb-5 border-b border-slate-100">
                              <h4 className="text-xl font-bold text-slate-900">Disburse Payment</h4>
                              <p className="text-sm text-slate-500 mt-1 font-medium">Record outgoing payments against a user's allocation cap.</p>
                           </div>
                           
                           <div className="flex flex-col md:flex-row gap-5 items-end mb-10 bg-slate-50 p-6 rounded-xl border border-slate-200">
                              <div className="flex-1 w-full">
                                 <label className="text-sm font-semibold text-slate-700 block mb-2">Select Employee</label>
                                 <select 
                                    value={paymentForm.employee_id} 
                                    onChange={(e) => {
                                      const selectedEmpId = e.target.value;
                                      let currentAmount = paymentForm.amount;
                                      
                                      if (selectedEmpId) {
                                        const empId = parseInt(selectedEmpId);
                                        const alloc = allocationsForm[empId] || { allocated: 0, incentive: 0 };
                                        const maxAllowed = Number(alloc.allocated) + Number(alloc.incentive);
                                        const existingPayments = salaryPayments.filter(sp => sp.project_id?.toString() === selectedProject?.id?.toString() && sp.employee_id?.toString() === empId.toString());
                                        const alreadyPaid = existingPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
                                        const remaining = Math.max(0, maxAllowed - alreadyPaid);
                                        
                                        if (currentAmount > remaining) currentAmount = remaining;
                                      }
                                      setPaymentForm({...paymentForm, employee_id: selectedEmpId, amount: currentAmount});
                                    }} 
                                    className="block w-full h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-900 outline-none bg-white shadow-sm focus:border-blue-600 transition-all"
                                 >
                                    <option value="">-- Choose Member --</option>
                                    {(formData.assignee_ids || []).map(id => <option key={id} value={id}>{getAvatar(id)?.name || 'Unknown'}</option>)}
                                 </select>
                              </div>
                              <div className="w-full md:w-40 shrink-0">
                                 <label className="text-sm font-semibold text-slate-700 block mb-2">Amount (₹)</label>
                                 <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">₹</span>
                                    <input 
                                      type="number" 
                                      value={paymentForm.amount || ''} 
                                      onChange={(e) => {
                                        let val = parseFloat(e.target.value);
                                        if (isNaN(val) || val < 0) val = 0;
                                        
                                        if (paymentForm.employee_id) {
                                          const empId = parseInt(paymentForm.employee_id);
                                          const alloc = allocationsForm[empId] || { allocated: 0, incentive: 0 };
                                          const maxAllowed = Number(alloc.allocated) + Number(alloc.incentive);
                                          const existingPayments = salaryPayments.filter(sp => sp.project_id?.toString() === selectedProject?.id?.toString() && sp.employee_id?.toString() === empId.toString());
                                          const alreadyPaid = existingPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
                                          const remaining = Math.max(0, maxAllowed - alreadyPaid);
                                          
                                          if (val > remaining) val = remaining;
                                        }
                                        setPaymentForm({...paymentForm, amount: val});
                                      }} 
                                      className="block w-full h-11 rounded-lg border border-slate-300 pl-8 pr-3 text-sm font-medium text-slate-900 outline-none bg-white shadow-sm focus:border-blue-600 transition-all" 
                                      placeholder="0" 
                                   />
                                 </div>
                              </div>
                              <div className="w-full md:w-40 shrink-0">
                                 <label className="text-sm font-semibold text-slate-700 block mb-2">Tranche Type</label>
                                 <select value={paymentForm.payment_type} onChange={(e) => setPaymentForm({...paymentForm, payment_type: e.target.value})} className="block w-full h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-900 outline-none bg-white shadow-sm focus:border-blue-600 transition-all">
                                    <option value="Advance">Advance</option>
                                    <option value="Standard">Standard</option>
                                    <option value="Final">Final</option>
                                 </select>
                              </div>
                              <button type="button" onClick={handleRecordProjectPayment} disabled={isSaving || !paymentForm.employee_id || paymentForm.amount <= 0} className="w-full md:w-auto h-11 px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-md">Record Payment</button>
                           </div>

                           <div>
                              <h4 className="text-lg font-bold text-slate-900 mb-5">Payment Ledger</h4>
                              <div className="space-y-4">
                                 {(formData.assignee_ids || []).map(empId => {
                                    const emp = getAvatar(empId);
                                    const empPayments = salaryPayments.filter(sp => sp.project_id?.toString() === selectedProject?.id?.toString() && sp.employee_id?.toString() === empId.toString());
                                    const totalPaid = empPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
                                    
                                    const alloc = allocationsForm[empId] || { allocated: 0, incentive: 0 };
                                    const totalAlloc = Number(alloc.allocated) + Number(alloc.incentive);
                                    
                                    const isExpanded = expandedFinanceEmpId === empId;

                                    if (empPayments.length === 0) return null;

                                    return (
                                       <div key={empId} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                          <button type="button" onClick={() => setExpandedFinanceEmpId(isExpanded ? null : empId)} className="w-full flex items-center justify-between p-5 bg-white hover:bg-slate-50 transition-colors">
                                             <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 ring-1 ring-slate-200 overflow-hidden shadow-sm">
                                                  {emp?.profile_image_url ? <img src={emp.profile_image_url} alt="" className="h-full w-full object-cover"/> : (emp?.name || 'U').charAt(0)}
                                                </div>
                                                <div className="text-left">
                                                   <span className="text-sm font-bold text-slate-900 block">{emp?.name || 'Unknown'}</span>
                                                   <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1 block">{empPayments.length} Transactions</span>
                                                </div>
                                             </div>
                                             <div className="flex flex-col items-end mr-4">
                                                <span className="text-sm font-black text-slate-900">₹{totalPaid.toLocaleString()} Paid</span>
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">of ₹{totalAlloc.toLocaleString()} Cap</span>
                                             </div>
                                             <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                          </button>
                                          <AnimatePresence>
                                             {isExpanded && (
                                                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-slate-50 border-t border-slate-200">
                                                   <div className="p-5 space-y-3">
                                                      {empPayments.map(p => {
                                                         const isEditingPayment = editingPaymentId === p.id;
                                                         
                                                         return isEditingPayment ? (
                                                            <div key={p.id} className="flex flex-col sm:flex-row gap-3 text-sm p-4 bg-white border border-blue-200 rounded-lg shadow-sm">
                                                               <input 
                                                                  type="number" 
                                                                  value={editPaymentForm.amount || ''} 
                                                                  onChange={(e) => {
                                                                    let val = parseFloat(e.target.value);
                                                                    if (isNaN(val) || val < 0) val = 0;
                                                                    
                                                                    const existingPayments = salaryPayments.filter(sp => sp.project_id?.toString() === selectedProject?.id?.toString() && sp.employee_id?.toString() === empId.toString() && sp.id !== p.id);
                                                                    const alreadyPaidOther = existingPayments.reduce((sum, pay) => sum + parseFloat(pay.amount), 0);
                                                                    const remaining = Math.max(0, totalAlloc - alreadyPaidOther);
                                                                    
                                                                    if (val > remaining) val = remaining;
                                                                    
                                                                    setEditPaymentForm({...editPaymentForm, amount: val});
                                                                  }} 
                                                                  className="w-full sm:w-40 h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-600 transition-all" 
                                                                  placeholder="Amount" 
                                                               />
                                                               <select value={editPaymentForm.payment_type} onChange={(e) => setEditPaymentForm({...editPaymentForm, payment_type: e.target.value})} className="w-full sm:w-40 h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-600 transition-all">
                                                                  <option value="Advance">Advance</option>
                                                                  <option value="Standard">Standard</option>
                                                                  <option value="Final">Final</option>
                                                               </select>
                                                               <div className="flex items-center gap-2 sm:ml-auto">
                                                                  <button type="button" onClick={() => setEditingPaymentId(null)} className="h-10 px-4 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-600 border border-slate-300 bg-white hover:bg-slate-50 transition-colors shadow-sm">Cancel</button>
                                                                  <button type="button" onClick={() => handleUpdateProjectPayment(p.id, empId)} disabled={isSaving} className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 shadow-md">Save</button>
                                                               </div>
                                                            </div>
                                                         ) : (
                                                            <div key={p.id} className="flex items-center justify-between text-sm p-4 bg-white border border-slate-200 rounded-lg shadow-sm group hover:border-slate-300 transition-all">
                                                               <div className="flex items-center gap-4">
                                                                  <span className="font-semibold text-slate-900">{new Date(p.payment_date).toLocaleDateString()}</span>
                                                                  <span className="text-xs px-3 py-1 bg-slate-100 text-slate-700 font-bold uppercase tracking-wider rounded-md">{p.payment_type}</span>
                                                               </div>
                                                               <div className="flex items-center gap-2">
                                                                  <span className="font-bold text-slate-900 mr-3">₹{parseFloat(p.amount).toLocaleString()}</span>
                                                                  <button type="button" onClick={() => { setEditingPaymentId(p.id); setEditPaymentForm({ amount: parseFloat(p.amount), payment_type: p.payment_type }); }} className="text-slate-400 hover:text-blue-600 transition-colors p-2 opacity-0 group-hover:opacity-100"><Edit2 className="h-4 w-4" /></button>
                                                                  <button type="button" onClick={() => handleDeleteProjectPayment(p.id)} className="text-slate-400 hover:text-red-600 transition-colors p-2 opacity-0 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                                                               </div>
                                                            </div>
                                                         );
                                                      })}
                                                   </div>
                                                </motion.div>
                                             )}
                                          </AnimatePresence>
                                       </div>
                                    );
                                 })}
                              </div>
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Content Footer */}
                  <div className="px-6 sm:px-10 py-5 border-t border-slate-200 bg-slate-50 flex justify-end items-center gap-4 shrink-0 mt-auto">
                    {selectedProject && isAdminView && modalTab === 'details' && (
                      <button type="button" onClick={handleDeleteProject} disabled={isSaving} className="px-5 py-2.5 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-sm font-semibold shadow-sm mr-auto transition-colors shrink-0 flex items-center gap-2"><Trash2 className="h-4 w-4" /> Delete Project</button>
                    )}
                    
                    <button type="button" onClick={handleCloseModal} className="px-6 py-2.5 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100 shadow-sm transition-colors flex-1 sm:flex-none">Cancel</button>

                    {isAdminView && (
                      <>
                        {!selectedProject && modalTab === 'details' && (
                          <button type="button" onClick={() => setModalTab('team')} className="px-8 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-semibold shadow-md transition-all flex-1 sm:flex-none flex items-center justify-center">
                            Next: Assign Team
                          </button>
                        )}
                        {!selectedProject && modalTab === 'team' && (
                          <button type="button" onClick={() => setModalTab('tasks')} className="px-8 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-semibold shadow-md transition-all flex-1 sm:flex-none flex items-center justify-center">
                            Next: Action Items
                          </button>
                        )}
                        {!selectedProject && modalTab === 'tasks' && (
                          <button type="button" onClick={handleSaveProject} disabled={isSaving || !hasUnsavedChanges} className={`px-8 py-2.5 rounded-lg text-sm font-semibold transition-all flex-1 sm:flex-none flex items-center justify-center ${(!hasUnsavedChanges || isSaving) ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700'}`}>
                            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Finish & Create Project"}
                          </button>
                        )}
                        {selectedProject && (
                          <button type="button" onClick={handleSaveProject} disabled={isSaving || !hasUnsavedChanges} className={`px-8 py-2.5 rounded-lg text-sm font-semibold transition-all flex-1 sm:flex-none flex items-center justify-center ${(!hasUnsavedChanges || isSaving) ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white shadow-md hover:bg-blue-700'}`}>
                            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Save Changes"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* TIMELINE MODAL RESTORED & FULLY FUNCTIONAL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {timelineModalEmpId && isAdminView && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10005] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
                 
                 <div className="px-6 py-5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                       <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 overflow-hidden border border-slate-200">
                          {getAvatar(timelineModalEmpId)?.profile_image_url ? <img src={getAvatar(timelineModalEmpId)?.profile_image_url} alt="" className="h-full w-full object-cover" /> : (getAvatar(timelineModalEmpId)?.name || 'U').charAt(0).toUpperCase()}
                       </div>
                       <div>
                         <h3 className="text-lg font-bold text-slate-900 leading-none">{getAvatar(timelineModalEmpId)?.name || "Unknown User"}</h3>
                         <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Timeline & Updates</p>
                       </div>
                    </div>
                    <button type="button" onClick={() => {setTimelineModalEmpId(null); setReactionFormId(null);}} className="h-8 w-8 bg-slate-100 hover:bg-slate-200 rounded text-slate-500 transition-colors flex justify-center items-center"><X className="h-4 w-4" /></button>
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    
                    <div>
                      <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2"><ListTodo className="h-4 w-4" /> Assigned Tasks</h4>
                      {displayTasks.filter(t => t.assignee_id?.toString() === timelineModalEmpId?.toString()).length === 0 ? (
                         <p className="text-sm text-slate-500 italic">No tasks assigned to this member.</p>
                      ) : (
                         <div className="space-y-3">
                           {displayTasks.filter(t => t.assignee_id?.toString() === timelineModalEmpId?.toString()).map((task, idx) => {
                             const taskKey = task.id || task.tempId || idx;
                             return (
                               <div key={taskKey} className="flex items-center gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-slate-300">
                                  <button type="button" onClick={() => handleAdminToggleTask(task)} className={`h-5 w-5 rounded flex items-center justify-center transition-colors cursor-pointer border ${task.is_completed ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300 hover:border-gray-400'}`}>
                                     {task.is_completed && <Check className="h-3 w-3 text-white" />}
                                  </button>
                                  <span className={`text-sm font-medium ${task.is_completed ? 'text-slate-500' : 'text-slate-900'}`}>{task.title}</span>
                               </div>
                             );
                           })}
                         </div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Activity Log</h4>
                      
                      {adminTimelineEntries.filter(e => e && typeof e === 'object').length > 0 ? (
                         <div className="space-y-6">
                           {adminTimelineEntries.filter(e => e && typeof e === 'object').map((entry: any) => {
                              const hasReaction = !!entry?.reaction;
                              const visual = getReactionVisuals(entry?.reaction?.status);
                              const VisualIcon = visual.icon || MessageCircle;

                              return (
                                <div key={entry.id} className="flex flex-col relative group">
                                   <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm z-10 relative">
                                      {entry.type === 'upload' && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold uppercase tracking-wider rounded mb-3">
                                           <FileText className="h-3.5 w-3.5" /> Attached File: {entry.task_title || "Unknown"}
                                        </span>
                                      )}
                                      <p className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">{entry.text || ''}</p>
                                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                                         <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Just now'}</span>
                                         {!hasReaction && reactionFormId !== entry.id && (
                                           <button type="button" onClick={() => setReactionFormId(entry.id)} className="text-xs font-semibold text-blue-600 hover:text-blue-700 uppercase tracking-wider transition-colors flex items-center gap-1"><Plus className="h-3.5 w-3.5"/> Add Feedback</button>
                                         )}
                                      </div>
                                   </div>

                                   {hasReaction && reactionFormId !== entry.id && (
                                      <div className="ml-6 sm:ml-10 mt-2 relative">
                                         <CornerDownRight className="absolute -left-5 top-4 h-5 w-5 text-slate-300" />
                                         <div className={`p-4 rounded-lg border ${visual.bg || 'bg-slate-50'} ${visual.border || 'border-slate-200'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                               <span className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${visual.text || 'text-slate-900'}`}>
                                                  <VisualIcon className="h-4 w-4" /> {entry.reaction?.status}
                                               </span>
                                               <div className="flex gap-3">
                                                  <button type="button" onClick={() => setReactionFormId(entry.id)} className={`text-xs font-semibold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity ${visual.text || 'text-slate-700'} hover:opacity-70`}><Edit2 className="h-3.5 w-3.5"/></button>
                                                  <button type="button" onClick={() => handleDeleteReaction(timelineModalEmpId, entry.id)} className={`text-xs font-semibold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:opacity-70`}><Trash2 className="h-3.5 w-3.5"/></button>
                                               </div>
                                            </div>
                                            {entry.reaction?.text && <p className={`text-sm mt-1 ${visual.text || 'text-slate-800'} opacity-90`}>{entry.reaction.text}</p>}
                                         </div>
                                      </div>
                                   )}

                                   {reactionFormId === entry.id && (
                                      <div className="ml-6 sm:ml-10 mt-3 relative animate-in fade-in slide-in-from-top-2">
                                         <CornerDownRight className="absolute -left-5 top-4 h-5 w-5 text-slate-300" />
                                         <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-lg">
                                            <div className="flex items-center justify-between mb-4">
                                               <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Provide Feedback</span>
                                               <button type="button" onClick={() => setReactionFormId(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                                            </div>
                                            <div className="flex flex-wrap gap-3 mb-4">
                                               <button type="button" onClick={() => handleAdminReact(timelineModalEmpId, entry.id, 'Approved', reactionText)} disabled={isSaving} className="flex-1 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"><ThumbsUp className="h-4 w-4"/> Approve</button>
                                               <button type="button" onClick={() => handleAdminReact(timelineModalEmpId, entry.id, 'Rejected', reactionText)} disabled={isSaving} className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"><ThumbsDown className="h-4 w-4"/> Reject</button>
                                               <button type="button" onClick={() => handleAdminReact(timelineModalEmpId, entry.id, 'Reviewed', reactionText)} disabled={isSaving} className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"><Eye className="h-4 w-4"/> Seen</button>
                                            </div>
                                            <textarea 
                                               value={reactionText} 
                                               onChange={(e) => setReactionText(e.target.value)}
                                               placeholder="Optional detailed comment..." 
                                               className="w-full h-20 rounded border border-slate-300 p-3 text-sm outline-none focus:border-slate-900 resize-none mb-4 bg-white"
                                            />
                                            <button type="button" onClick={() => handleAdminReact(timelineModalEmpId, entry.id, 'Comment', reactionText)} disabled={isSaving || !reactionText.trim()} className="w-full h-10 bg-slate-900 text-white rounded text-sm font-semibold transition-colors hover:bg-slate-800 disabled:opacity-50">Submit Note</button>
                                         </div>
                                      </div>
                                   )}
                                </div>
                              );
                           })}
                         </div>
                      ) : (
                         <div className="flex flex-col items-center justify-center text-center p-10 bg-white rounded-lg border border-dashed border-slate-300">
                            <Clock className="h-10 w-10 text-slate-400 mb-4" />
                            <p className="text-sm font-medium text-slate-500">No entries yet.</p>
                         </div>
                      )}
                    </div>
                 </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* OTHER UTILITY MODALS (Upload, Alerts, etc.) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isUploadModalOpen && taskToUpload && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200">
                <div className="bg-blue-600 p-6 sm:p-8 text-center relative border-b border-blue-700">
                  <button type="button" onClick={() => setIsUploadModalOpen(false)} className="absolute top-4 right-4 h-8 w-8 bg-blue-700 hover:bg-blue-800 rounded flex items-center justify-center text-white transition-colors"><X className="h-4 w-4" /></button>
                  <div className="h-16 w-16 bg-white rounded-xl mx-auto flex items-center justify-center mb-4 shadow-sm">
                    <UploadCloud className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Project Drive</h3>
                  <p className="text-sm font-medium text-blue-100 mt-2">{taskToUpload.title}</p>
                </div>
                <div className="p-6 sm:p-8 space-y-6">
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="h-6 w-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">Upload to Secure Workspace</p>
                        <p className="text-sm text-slate-500 mt-1 leading-relaxed">Click below to open the secure project drive. Drag and drop your files into the folder.</p>
                        <a href={selectedProject?.drive_folder_url || "#"} target="_blank" rel="noopener noreferrer" className={`mt-4 w-full flex items-center justify-center gap-2 h-10 rounded-md text-sm font-semibold transition-all ${selectedProject?.drive_folder_url ? 'bg-white text-blue-600 hover:bg-blue-50 border border-blue-200 shadow-sm' : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'}`}>
                          {selectedProject?.drive_folder_url ? <><ExternalLink className="h-4 w-4" /> Open Project Drive</> : "No Drive Link Provided"}
                        </a>
                      </div>
                    </div>
                    <div className="w-full h-px bg-slate-200" />
                    <div className="flex items-start gap-4">
                      <div className="h-6 w-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">Add an Update Note <span className="text-red-500">*</span></p>
                        <p className="text-sm text-slate-500 mt-1 leading-relaxed mb-4">Provide a brief description of the files you just uploaded.</p>
                        <textarea 
                           value={uploadNote}
                           onChange={(e) => setUploadNote(e.target.value)}
                           placeholder="e.g., Uploaded the revised V2 floorplans in PDF format..."
                           className="w-full h-24 rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 shadow-sm resize-none"
                        />
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={handleEmployeeUploadComplete} disabled={isSaving || (!selectedProject?.drive_folder_url && formData.resource_links.length === 0)} className="w-full h-10 bg-blue-600 text-white hover:bg-blue-700 rounded-md text-sm font-semibold transition-all flex items-center justify-center disabled:opacity-50 shadow-sm">
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
          {customAlert && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10020] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-8 relative flex flex-col items-center text-center border border-slate-200">
                <div className={`h-14 w-14 rounded-full flex items-center justify-center mb-5 border ${customAlert.type === 'error' ? 'bg-red-50 border-red-100 text-red-600' : customAlert.type === 'success' ? 'bg-green-50 border-green-100 text-green-600' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
                  {customAlert.type === 'error' ? <AlertCircle className="h-7 w-7" /> : customAlert.type === 'success' ? <CheckCircle2 className="h-7 w-7" /> : <Info className="h-7 w-7" />}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{customAlert.title}</h3>
                <p className="text-sm text-slate-500 mb-8 leading-relaxed font-medium">
                  {customAlert.message}
                </p>
                <button type="button" onClick={() => setCustomAlert(null)} className="w-full h-10 rounded-md text-white font-semibold text-sm transition-colors bg-blue-600 hover:bg-blue-700 shadow-sm">OK</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {confirmAction && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10020] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-8 relative flex flex-col items-center text-center border border-slate-200">
                <div className="h-14 w-14 rounded-full bg-red-50 border border-red-100 text-red-600 flex items-center justify-center mb-5">
                  <AlertCircle className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{confirmAction.title}</h3>
                <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
                  {confirmAction.message}
                </p>
                <div className="flex gap-3 w-full">
                  <button type="button" onClick={() => setConfirmAction(null)} className="flex-1 h-10 rounded-md bg-white border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                  <button type="button" onClick={() => { confirmAction.action(); setConfirmAction(null); }} className="flex-1 h-10 rounded-md bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-colors shadow-sm">Confirm</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showDiscardPrompt && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10010] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-8 relative flex flex-col items-center text-center border border-slate-200">
                <div className="h-14 w-14 rounded-full bg-red-50 border border-red-100 text-red-600 flex items-center justify-center mb-5">
                  <AlertCircle className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Unsaved Changes</h3>
                <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
                  You have unsaved changes. Are you sure you want to discard them and close?
                </p>
                <div className="flex gap-3 w-full">
                  <button type="button" onClick={() => setShowDiscardPrompt(false)} className="flex-1 h-10 rounded-md bg-white border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                  <button type="button" onClick={executeClose} className="flex-1 h-10 rounded-md bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-colors shadow-sm">Discard</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {taskRedirectPrompt && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10010] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-8 relative flex flex-col items-center text-center border border-slate-200">
                <div className="h-14 w-14 rounded-full bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mb-5">
                  <ListTodo className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Update via Timeline</h3>
                <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
                  Task completion must be recorded directly in <strong>{getAvatar(taskRedirectPrompt.assignee_id)?.name}'s</strong> personal timeline to ensure accurate activity logging.
                </p>
                <div className="flex gap-3 w-full">
                  <button type="button" onClick={() => setTaskRedirectPrompt(null)} className="flex-1 h-10 rounded-md bg-white border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                  <button type="button" onClick={() => {
                    setModalTab('progress');
                    setTimelineModalEmpId(taskRedirectPrompt.assignee_id);
                    setTaskRedirectPrompt(null);
                  }} className="flex-1 h-10 rounded-md bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors shadow-sm">Go To Timeline</button>
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
