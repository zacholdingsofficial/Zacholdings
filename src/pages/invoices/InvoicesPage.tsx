import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Download, Printer, X, CheckCircle2, Building2, UserSquare2, Trash2, Receipt, ArrowRight } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useDataStore } from "../../store/dataStore";
import { supabase } from "../../supabase";

const STATUS_OPTIONS = ['Pending', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];

export default function InvoicesPage() {
  const { role, activeWorkspace, companyId } = useAuthStore();
  
  const { 
    invoices, invoiceItems, invoicePayments, projects, 
    customers, companies, employees, projectAllocations, salaryPayments, expenses = [], fetchAllData 
  } = useDataStore();

  const isAdmin = role === 'admin';
  const isHead = role === 'head';
  const currentCompanyId = isAdmin ? (activeWorkspace || "") : companyId;
  const currentCompany = companies.find((c: any) => c.id?.toString() === currentCompanyId?.toString());
  
  // --- DYNAMIC FINANCE ACCESS CHECK ---
  // If ON: See Invoices/Billing. If OFF: See Project Expenses/Cost Sheets.
  const canViewFinance = isAdmin || (isHead && currentCompany?.allow_head_finance !== false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    company_id: currentCompanyId?.toString() || "", customer_id: "", project_id: "",
    invoice_number: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
    issue_date: today, due_date: "", tax_rate: 0, discount_amount: 0, amount_paid: 0, status: "Pending"
  });

  const [lineItems, setLineItems] = useState([{ description: "", quantity: 1, rate: 0 }]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [newPayment, setNewPayment] = useState({ amount: 0, payment_date: today, payment_method: "Bank Transfer", reference_note: "" });

  const availableCustomers = customers.filter(c => c.company_id === parseInt(formData.company_id));
  const availableProjects = projects.filter(p => {
    if (isAdmin && !activeWorkspace) return true;
    return p.company_id === currentCompanyId;
  });

  const getDynamicStatus = (inv: any) => {
    if (inv.status === 'Paid') return 'Paid';
    if (inv.status === 'Cancelled') return 'Cancelled';
    if (new Date(inv.due_date) < new Date(today) && inv.status !== 'Paid') return 'Overdue';
    if (inv.amount_paid > 0 && inv.amount_paid < inv.total_amount) return 'Partially Paid';
    return inv.status;
  };

  // --- FULL ACCESS: Standard Client Invoices (Income) ---
  const visibleInvoices = invoices.filter(inv => {
    const proj = projects.find(p => p.id === inv.project_id);
    const searchStr = searchQuery.toLowerCase();
    
    // Search matches invoice number OR linked project name
    const matchesSearch = inv.invoice_number.toLowerCase().includes(searchStr) || 
                          (proj && proj.name.toLowerCase().includes(searchStr));
                          
    const dynamicStatus = getDynamicStatus(inv);
    const matchesStatus = filterStatus === "All" || dynamicStatus === filterStatus;

    if (isAdmin && !activeWorkspace) {
      const matchesCompany = filterCompanyId === "all" || inv.company_id.toString() === filterCompanyId;
      return matchesSearch && matchesStatus && matchesCompany;
    }
    return matchesSearch && matchesStatus && inv.company_id === currentCompanyId;
  }).sort((a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime());


  // --- RESTRICTED ACCESS: Dynamic Project Expense Reports (Costs + Labor) ---
  const headProjectExpenses = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch && p.company_id === currentCompanyId;
  }).map(p => {
    // 1. Calculate Labor Allocations
    const pAllocations = projectAllocations.filter(a => a.project_id === p.id);
    const totalAllocated = pAllocations.reduce((sum, a) => sum + (a.allocated_amount || 0) + (a.incentive_amount || 0), 0);
    const pPayments = salaryPayments.filter(sp => sp.project_id === p.id);
    const totalPaidSalaries = pPayments.reduce((sum, sp) => sum + parseFloat(sp.amount || 0), 0);

    // 2. Calculate Additional Project Expenses
    const pExpenses = expenses.filter((e: any) => e.project_id === p.id);
    const totalProjectExpenses = pExpenses.reduce((sum: number, e: any) => sum + parseFloat(e.amount || 0), 0);

    return {
      isExpenseReport: true, // Flag identifying it as a Head view read-only document
      id: p.id,
      project_id: p.id,
      project_name: p.name,
      invoice_number: `COST-${p.id.toString().padStart(4, '0')}`,
      company_id: p.company_id,
      issue_date: p.approval_date || today,
      due_date: p.due_date || today,
      total_amount: totalAllocated + totalProjectExpenses, // Total Cost = Labor + Expenses
      amount_paid: totalPaidSalaries + totalProjectExpenses, // We assume external expenses are cleared/paid, so they add to the paid pool
      status: p.status || 'Active',
      allocations: pAllocations,
      project_expenses: pExpenses // Passed down for rendering expense line items
    }
  });

  const displayList = !canViewFinance ? headProjectExpenses : visibleInvoices;

  const currentInvoicePayments = selectedInvoice && !selectedInvoice.isExpenseReport 
      ? invoicePayments.filter(p => p.invoice_id === selectedInvoice.id) 
      : [];

  const subtotal = selectedInvoice?.isExpenseReport 
      ? selectedInvoice.total_amount 
      : lineItems.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  
  const taxAmount = selectedInvoice?.isExpenseReport ? 0 : (subtotal * formData.tax_rate) / 100;
  const grandTotal = selectedInvoice?.isExpenseReport ? subtotal : (subtotal + taxAmount) - formData.discount_amount;
  
  const totalPaid = selectedInvoice?.isExpenseReport 
      ? selectedInvoice.amount_paid 
      : currentInvoicePayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      
  const balanceDue = Math.max(0, grandTotal - totalPaid);

  const issuingCompany = companies.find(c => c.id === parseInt(formData.company_id || selectedInvoice?.company_id));
  const selectedCustomer = customers.find(c => c.id === parseInt(formData.customer_id));
  const linkedProject = projects.find(p => p.id === parseInt(formData.project_id || selectedInvoice?.project_id));
  const internalBilledCompany = linkedProject?.internal_company_id ? companies.find(c => c.id === linkedProject.internal_company_id) : null;

  const openNewInvoice = () => {
    setSelectedInvoice(null);
    setFormData({
      company_id: currentCompanyId?.toString() || "", customer_id: "", project_id: "",
      invoice_number: `INV-${Math.floor(10000 + Math.random() * 90000)}`,
      issue_date: today, due_date: "", tax_rate: 0, discount_amount: 0, amount_paid: 0, status: "Pending"
    });
    setLineItems([{ description: "", quantity: 1, rate: 0 }]);
    setShowPaymentForm(false);
    setIsModalOpen(true);
  };

  const openViewInvoice = (inv: any) => {
    setSelectedInvoice(inv);
    
    if (inv.isExpenseReport) {
       setFormData({
         company_id: inv.company_id.toString(), customer_id: "", project_id: inv.project_id.toString(),
         invoice_number: inv.invoice_number, issue_date: inv.issue_date, due_date: inv.due_date,
         tax_rate: 0, discount_amount: 0, status: inv.status, amount_paid: inv.amount_paid
       });
    } else {
       setFormData({
         company_id: inv.company_id.toString(), customer_id: inv.customer_id?.toString() || "", project_id: inv.project_id?.toString() || "",
         invoice_number: inv.invoice_number, issue_date: inv.issue_date, due_date: inv.due_date,
         tax_rate: inv.tax_rate, discount_amount: inv.discount_amount, status: inv.status, amount_paid: inv.amount_paid
       });
       const items = invoiceItems.filter(item => item.invoice_id === inv.id);
       setLineItems(items.length > 0 ? items : [{ description: "", quantity: 1, rate: 0 }]);
    }
    
    setShowPaymentForm(false);
    setIsModalOpen(true);
  };

  const handleProjectSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pid = e.target.value;
    if (!pid) {
      setFormData({ ...formData, project_id: "" });
      return;
    }
    const proj = projects.find(p => p.id.toString() === pid);
    if (proj) {
      setFormData({
        ...formData, project_id: pid, company_id: proj.company_id.toString(), customer_id: proj.customer_id?.toString() || ""
      });
    }
  };

  const handleSaveInvoice = async () => {
    if (selectedInvoice?.isExpenseReport) return; // Prevent saving dynamically generated reports
    
    if (!formData.company_id) return alert("Select a company.");
    if (!formData.customer_id && !linkedProject?.internal_company_id) return alert("Select a customer or an internal project.");
    if (!formData.due_date) return alert("Select a due date.");
    if (lineItems.some(i => !i.description.trim())) return alert("All line items must have a description.");

    setIsSaving(true);
    try {
      let computedStatus = formData.status;
      if (totalPaid >= grandTotal && grandTotal > 0) computedStatus = 'Paid';
      else if (totalPaid > 0 && totalPaid < grandTotal) computedStatus = 'Partially Paid';

      const payload = {
        company_id: parseInt(formData.company_id), 
        customer_id: formData.customer_id ? parseInt(formData.customer_id) : null,
        project_id: formData.project_id ? parseInt(formData.project_id) : null,
        invoice_number: formData.invoice_number, issue_date: formData.issue_date, due_date: formData.due_date,
        subtotal, tax_rate: formData.tax_rate, discount_amount: formData.discount_amount, 
        total_amount: grandTotal, amount_paid: totalPaid, status: computedStatus
      };

      let newInvoiceId = selectedInvoice?.id;

      if (!selectedInvoice) {
        const { data, error } = await supabase.from('invoices').insert([payload]).select().single();
        if (error) throw error;
        newInvoiceId = data.id;
      } else {
        const { error } = await supabase.from('invoices').update(payload).eq('id', selectedInvoice.id);
        if (error) throw error;
        await supabase.from('invoice_items').delete().eq('invoice_id', selectedInvoice.id);
      }

      const itemsToInsert = lineItems.map(item => ({
        invoice_id: newInvoiceId, description: item.description, quantity: item.quantity, rate: item.rate, total: item.quantity * item.rate
      }));
      await supabase.from('invoice_items').insert(itemsToInsert);

      await fetchAllData();
      setIsModalOpen(false);
    } catch (error: any) { alert(`Error saving invoice: ${error.message}`); } finally { setIsSaving(false); }
  };

  const handleRecordPayment = async () => {
    if (newPayment.amount <= 0) return alert("Enter a valid amount");
    if (!selectedInvoice) return alert("Please save the invoice first before recording payments.");
    
    setIsSaving(true);
    try {
      const { error: paymentError } = await supabase.from('invoice_payments').insert([{
        invoice_id: selectedInvoice.id, company_id: parseInt(formData.company_id), amount: newPayment.amount,
        payment_date: newPayment.payment_date, payment_method: newPayment.payment_method, reference_note: newPayment.reference_note
      }]);
      if (paymentError) throw paymentError;

      const newTotalPaid = totalPaid + newPayment.amount;
      let newStatus = formData.status;
      if (newTotalPaid >= grandTotal) newStatus = 'Paid';
      else if (newTotalPaid > 0) newStatus = 'Partially Paid';

      await supabase.from('invoices').update({ amount_paid: newTotalPaid, status: newStatus }).eq('id', selectedInvoice.id);

      await fetchAllData();
      setShowPaymentForm(false);
      setNewPayment({ amount: 0, payment_date: today, payment_method: "Bank Transfer", reference_note: "" });
      setFormData(prev => ({...prev, status: newStatus})); 
    } catch (error: any) { alert(`Error recording payment: ${error.message}`); } finally { setIsSaving(false); }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!window.confirm("Remove this payment record?")) return;
    setIsSaving(true);
    try {
      await supabase.from('invoice_payments').delete().eq('id', paymentId);
      const paymentToRemove = currentInvoicePayments.find(p => p.id === paymentId);
      const newTotalPaid = totalPaid - (paymentToRemove ? paymentToRemove.amount : 0);
      let newStatus = formData.status;
      if (newTotalPaid <= 0) newStatus = 'Pending';
      else if (newTotalPaid < grandTotal) newStatus = 'Partially Paid';
      
      await supabase.from('invoices').update({ amount_paid: newTotalPaid, status: newStatus }).eq('id', selectedInvoice.id);
      await fetchAllData();
      setFormData(prev => ({...prev, status: newStatus}));
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleDeleteInvoice = async () => {
    if (!selectedInvoice || selectedInvoice.isExpenseReport) return;
    if (!window.confirm(`Delete invoice ${selectedInvoice.invoice_number}?`)) return;
    await supabase.from('invoices').delete().eq('id', selectedInvoice.id);
    await fetchAllData(); setIsModalOpen(false);
  };

  const handlePrint = () => window.print();

  const exportCSV = () => {
    const headers = canViewFinance 
        ? ["Invoice Number", "Company", "Customer", "Project", "Issue Date", "Due Date", "Total Amount", "Amount Paid", "Status"]
        : ["Cost ID", "Company", "Project Name", "Start Date", "End Date", "Total Project Costs", "Disbursed", "Project Status"];
        
    const rows = displayList.map(inv => [
      inv.invoice_number,
      companies.find(c => c.id === inv.company_id)?.name || 'Unknown',
      canViewFinance ? (customers.find(c => c.id === inv.customer_id)?.name || 'Internal Transfer') : inv.project_name,
      canViewFinance ? (projects.find(p => p.id === inv.project_id)?.name || 'None') : inv.issue_date,
      canViewFinance ? inv.issue_date : inv.due_date,
      canViewFinance ? inv.due_date : inv.total_amount,
      canViewFinance ? inv.total_amount : inv.amount_paid,
      canViewFinance ? (inv.amount_paid || 0) : inv.status,
      canViewFinance ? inv.status : ''
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${canViewFinance ? 'Client_Invoices' : 'Project_Expense_Reports'}_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'Paid': return 'bg-emerald-50 text-emerald-600 border-emerald-200';
      case 'Partially Paid': return 'bg-blue-50 text-blue-600 border-blue-200';
      case 'Overdue': return 'bg-rose-50 text-rose-600 border-rose-200 shadow-sm';
      case 'Pending': return 'bg-amber-50 text-amber-600 border-amber-200';
      case 'Cancelled': return 'bg-slate-50 text-slate-500 border-slate-200';
      // Head specific styles
      case 'Active': return 'bg-blue-50 text-blue-600 border-blue-200';
      case 'Completed': return 'bg-emerald-50 text-emerald-600 border-emerald-200';
      default: return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  return (
    <>
      <div className="max-w-[1200px] mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-700 pb-8 relative z-0 print:p-0 print:m-0">
        
        {/* Minimal Dotted Background Pattern */}
        <div className="absolute inset-0 pointer-events-none z-[-1] overflow-hidden print:hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4wOCkiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,white,transparent)]" />
        </div>

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6 print:hidden">
          <div>
            <p className="text-[9px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-1.5 sm:mb-2 bg-blue-50 inline-block px-2.5 sm:px-3 py-1 rounded-full">
              {canViewFinance ? 'Billing & Ledger' : 'Internal Auditing'}
            </p>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-1 sm:mt-2">
              {canViewFinance ? 'Invoices.' : 'Project Expenses.'}
            </h1>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button onClick={exportCSV} className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 px-3 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-[13px] font-bold transition-all flex items-center justify-center shrink-0">
              <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" /> Export CSV
            </button>
            {canViewFinance && (
              <button onClick={openNewInvoice} className="flex-1 sm:flex-none bg-gradient-to-r from-blue-900 to-indigo-800 text-white shadow-lg shadow-blue-900/20 hover:shadow-xl hover:-translate-y-0.5 px-3 sm:px-6 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-[13px] font-bold transition-all flex items-center justify-center shrink-0">
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" /> Create <span className="hidden sm:inline ml-1">Invoice</span>
              </button>
            )}
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="bg-white p-2 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm print:hidden flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 w-3.5 sm:w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder={canViewFinance ? "Search invoices or project names..." : "Search expense reports by project name..."}
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="w-full h-10 sm:h-11 pl-9 sm:pl-11 pr-4 rounded-lg sm:rounded-xl border-none text-[13px] sm:text-sm font-medium outline-none bg-transparent focus:ring-0 placeholder:text-slate-400" 
            />
          </div>
          
          {isAdmin && !activeWorkspace && (
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

          {canViewFinance && (
            <div className="sm:w-48 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-2">
              <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)} 
                className="w-full h-10 sm:h-11 rounded-lg sm:rounded-xl bg-slate-50 border-none px-3 sm:px-4 text-[12px] sm:text-sm font-bold text-slate-700 outline-none cursor-pointer appearance-none"
                style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px' }}
              >
                <option value="All">All Statuses</option>
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* INVOICES / REPORTS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 print:hidden">
          {displayList.length === 0 && <div className="col-span-full h-32 sm:h-48 border border-slate-200 border-dashed rounded-2xl sm:rounded-3xl flex items-center justify-center text-slate-400 bg-slate-50/50"><p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest">No matching records found</p></div>}
          {displayList.map((inv: any) => {
            const status = canViewFinance ? getDynamicStatus(inv) : inv.status;
            
            const gridTitle = canViewFinance 
                ? inv.invoice_number 
                : inv.project_name;
                
            const gridClientName = canViewFinance
                ? (inv.customer_id 
                    ? customers.find(c => c.id === inv.customer_id)?.name 
                    : projects.find(p => p.id === inv.project_id)?.internal_company_id 
                      ? `${companies.find(c => c.id === projects.find(p => p.id === inv.project_id)?.internal_company_id)?.name} (Internal)` 
                      : 'Unknown Client')
                : inv.invoice_number; // Show COST-00XX string as the subtitle for heads

            return (
              <motion.div key={inv.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} onClick={() => openViewInvoice(inv)} className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col relative overflow-hidden group cursor-pointer p-4 sm:p-6">
                <div className="flex justify-between items-start mb-3 sm:mb-4">
                  <span className="text-[13px] sm:text-[14px] font-black text-slate-900 truncate pr-2">{gridTitle}</span>
                  <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[8px] sm:text-[9px] font-bold uppercase tracking-widest shrink-0 border shadow-sm ${getStatusStyle(status)}`}>{status}</span>
                </div>
                <div className="space-y-1 sm:space-y-1.5 mb-4 sm:mb-6">
                  <p className="text-[11px] sm:text-[12px] font-medium text-slate-600 flex items-center gap-1.5 sm:gap-2 truncate">
                    {canViewFinance ? <UserSquare2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400 shrink-0" /> : <Receipt className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400 shrink-0" />} 
                    <span className="truncate">{gridClientName}</span>
                  </p>
                  {canViewFinance && inv.project_id && <p className="text-[11px] sm:text-[12px] font-medium text-slate-600 flex items-center gap-1.5 sm:gap-2 truncate"><Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400 shrink-0" /> <span className="truncate">{projects.find(p => p.id === inv.project_id)?.name}</span></p>}
                </div>
                <div className="mt-auto pt-3 sm:pt-4 border-t border-slate-50 flex justify-between items-end">
                  <div>
                    <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{canViewFinance ? 'Due Date' : 'Target Date'}</p>
                    <p className={`text-[11px] sm:text-[12px] font-bold ${status === 'Overdue' ? 'text-rose-500' : 'text-slate-800'}`}>{inv.due_date ? new Date(inv.due_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : 'TBD'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{canViewFinance ? 'Total' : 'Project Cost'}</p>
                    <p className={`text-lg sm:text-xl font-bold tracking-tight ${!canViewFinance ? 'text-rose-600' : 'text-slate-900'}`}>₹{(inv.total_amount || 0).toLocaleString()}</p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* --- INVOICE / EXPENSE MODAL --- */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center max-sm:px-4 max-sm:pt-20 max-sm:pb-[110px] sm:p-4 bg-slate-900/40 backdrop-blur-sm print:relative print:inset-auto print:p-0 print:bg-transparent">
              <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-full sm:max-h-[85svh] flex flex-col overflow-hidden border border-slate-100 mt-auto sm:mt-0 print:shadow-none print:border-none print:rounded-none print:max-h-none print:h-auto print:overflow-visible">
                
                <div className="px-5 sm:px-8 pt-5 sm:pt-7 border-b border-slate-100 bg-[#FAFCFF] shrink-0 print:hidden">
                  <div className="flex items-center justify-between mb-4 sm:mb-5">
                    <div>
                      <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest px-2 sm:px-2.5 py-1 rounded-full ${selectedInvoice?.isExpenseReport ? 'text-rose-600 bg-rose-50' : 'text-blue-600 bg-blue-50'}`}>
                        {selectedInvoice?.isExpenseReport ? 'Internal Expense Report' : 'Ledger Document'}
                      </span>
                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-1.5">
                        {selectedInvoice?.isExpenseReport 
                            ? `${selectedInvoice.project_name} Cost Sheet` 
                            : (selectedInvoice ? `Invoice ${formData.invoice_number}` : 'Generate Invoice')}
                      </h3>
                    </div>
                    <div className="flex gap-2 sm:gap-3">
                      {selectedInvoice && <button onClick={handlePrint} className="h-8 w-8 sm:h-10 sm:w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-blue-600 shadow-sm transition-colors"><Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button>}
                      <button onClick={() => setIsModalOpen(false)} className="h-8 w-8 sm:h-10 sm:w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 shadow-sm transition-colors"><X className="h-4 w-4 sm:h-5 sm:w-5" /></button>
                    </div>
                  </div>
                </div>

                {/* PDF Print Canvas / Scrollable Body */}
                <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-8 lg:p-12 max-sm:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar-thumb]:bg-slate-200 sm:[&::-webkit-scrollbar-thumb]:rounded-full bg-white print:p-6 print:overflow-visible print:h-auto">
                  
                  <div className="flex flex-col sm:flex-row justify-between items-start mb-8 sm:mb-12 print:mb-6 gap-6 sm:gap-0">
                    <div>
                      {issuingCompany?.logo_url ? (
                         <img src={issuingCompany.logo_url} alt="Logo" className="h-12 sm:h-16 w-auto object-contain mb-3 sm:mb-5 print:mb-2 print:h-12" />
                      ) : (
                        <div className={`h-10 w-10 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br flex items-center justify-center text-white text-[16px] sm:text-[20px] font-black tracking-tighter mb-3 sm:mb-4 shadow-sm print:h-10 print:w-10 print:text-sm print:rounded-lg print:mb-2 ${selectedInvoice?.isExpenseReport ? 'from-rose-900 via-rose-800 to-rose-700' : 'from-slate-900 via-blue-900 to-blue-800'}`}>
                          {issuingCompany?.name ? issuingCompany.name.charAt(0) : 'Z'}
                        </div>
                      )}
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight print:text-lg">{issuingCompany?.name || 'Zac Holdings'}</h2>
                    </div>
                    <div className="text-left sm:text-right">
                      <h1 className="text-2xl sm:text-4xl font-light tracking-tight text-slate-300 uppercase print:text-2xl">
                        {selectedInvoice?.isExpenseReport ? 'COST SHEET' : 'INVOICE'}
                      </h1>
                      <div className="mt-3 sm:mt-5 space-y-1 sm:space-y-1.5 print:mt-2 print:space-y-0.5">
                        <p className="text-[12px] sm:text-sm text-slate-800 font-bold print:text-xs">
                          <span className="text-slate-400 font-medium mr-2">{selectedInvoice?.isExpenseReport ? 'Ref:' : 'No:'}</span> 
                          {formData.invoice_number}
                        </p>
                        <p className="text-[12px] sm:text-sm text-slate-800 font-bold flex flex-row sm:items-center sm:justify-end print:text-xs">
                          <span className="text-slate-400 font-medium mr-2 w-10 sm:w-auto">Date:</span> 
                          {selectedInvoice?.isExpenseReport ? (
                             <span className="sm:text-right">{formData.issue_date ? new Date(formData.issue_date).toLocaleDateString() : ''}</span>
                          ) : (
                             <>
                               <input type="date" value={formData.issue_date} onChange={e=>setFormData({...formData, issue_date: e.target.value})} className="border-none bg-transparent outline-none cursor-pointer sm:text-right w-32 print:hidden" />
                               <span className="hidden print:inline">{formData.issue_date ? new Date(formData.issue_date).toLocaleDateString() : ''}</span>
                             </>
                          )}
                        </p>
                        <p className="text-[12px] sm:text-sm text-slate-800 font-bold flex flex-row sm:items-center sm:justify-end print:text-xs">
                          <span className="text-slate-400 font-medium mr-2 w-10 sm:w-auto">Due:</span> 
                          {selectedInvoice?.isExpenseReport ? (
                             <span className="text-rose-500 sm:text-right">{formData.due_date ? new Date(formData.due_date).toLocaleDateString() : 'N/A'}</span>
                          ) : (
                             <>
                               <input type="date" value={formData.due_date} onChange={e=>setFormData({...formData, due_date: e.target.value})} className="border-none bg-transparent outline-none cursor-pointer text-rose-500 sm:text-right w-32 print:hidden" />
                               <span className="hidden print:inline text-rose-500">{formData.due_date ? new Date(formData.due_date).toLocaleDateString() : 'N/A'}</span>
                             </>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8 mb-6 sm:mb-10 p-4 sm:p-6 bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-100 print:bg-transparent print:border-none print:p-0 print:mb-6 print:gap-4">
                    {isAdmin && !activeWorkspace && !selectedInvoice?.isExpenseReport && (
                      <div className="print:hidden">
                        <p className="text-[9px] sm:text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1.5 sm:mb-2">Issuing Subsidiary</p>
                        <select value={formData.company_id} onChange={(e) => setFormData({...formData, company_id: e.target.value, customer_id: "", project_id: ""})} className="w-full bg-transparent text-[14px] sm:text-lg font-bold text-slate-900 outline-none cursor-pointer border-b border-slate-200 pb-1">
                          <option value="" disabled>-- Select Company --</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    )}

                    <div className={`${(isAdmin && !activeWorkspace && !selectedInvoice?.isExpenseReport) ? '' : 'sm:col-span-1 md:col-span-1'} print:col-span-2`}>
                      <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 sm:mb-2 print:text-[8px] print:mb-1">
                        {selectedInvoice?.isExpenseReport ? 'Subject Project' : 'Billed To'} <span className="text-rose-500 print:hidden">*</span>
                      </p>
                      
                      {selectedInvoice?.isExpenseReport ? (
                         <div className="text-slate-800">
                            <h3 className="text-sm sm:text-lg font-black">{selectedInvoice.project_name}</h3>
                            <p className="text-[11px] sm:text-xs mt-1 text-slate-500 leading-relaxed font-bold">Labor & Expense Analysis</p>
                         </div>
                      ) : linkedProject?.internal_company_id ? (
                        <>
                          <div className="w-full bg-blue-50/50 text-[14px] sm:text-lg font-bold text-blue-900 border-b border-slate-200 pb-1 print:hidden px-2 rounded-t-lg truncate">
                            {internalBilledCompany?.name || 'Internal Company'} (In-House)
                          </div>
                          <div className="hidden print:block text-slate-800">
                             <h3 className="text-sm font-bold">{internalBilledCompany?.name || "Internal Company"}</h3>
                             <p className="text-xs mt-1 text-slate-500 leading-relaxed max-w-xs">Internal Sub-Contract / Operations Transfer</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <select value={formData.customer_id} onChange={(e) => setFormData({...formData, customer_id: e.target.value})} disabled={!formData.company_id && (isAdmin && !activeWorkspace)} className="w-full bg-transparent text-[14px] sm:text-lg font-bold text-slate-900 outline-none cursor-pointer border-b border-slate-200 pb-1 disabled:opacity-50 print:hidden truncate">
                             <option value="">-- Select Client --</option>
                             {availableCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <div className="hidden print:block text-slate-800">
                             <h3 className="text-sm font-bold">{selectedCustomer?.name || "Client Name"}</h3>
                             {selectedCustomer?.phone && <p className="text-xs mt-0.5 font-medium">{selectedCustomer.phone}</p>}
                             <p className="text-xs mt-1 text-slate-500 leading-relaxed max-w-xs">{selectedCustomer?.address || "Address details pending update..."}</p>
                          </div>
                        </>
                      )}
                    </div>

                    {!selectedInvoice?.isExpenseReport && (
                      <div className={`${isAdmin && !activeWorkspace ? '' : 'sm:col-span-1 md:col-span-2'} print:col-span-1 print:text-right`}>
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 sm:mb-2 print:text-[8px] print:mb-1">Linked Project <span className="print:hidden">(Optional)</span></p>
                        <select value={formData.project_id} onChange={handleProjectSelect} className="w-full bg-transparent text-[14px] sm:text-lg font-bold text-blue-800 outline-none cursor-pointer border-b border-slate-200 pb-1 disabled:opacity-50 print:hidden truncate">
                           <option value="">-- Standalone Invoice --</option>
                           {availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <div className="hidden print:block text-slate-800">
                           <h3 className="text-sm font-bold text-blue-800">{linkedProject?.name || "Standalone Services"}</h3>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mb-8 sm:mb-10 print:mb-4">
                    {/* Line Items Table */}
                    <div className="overflow-x-auto max-sm:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                      <div className="min-w-[500px]">
                        <div className="grid grid-cols-12 gap-2 sm:gap-4 pb-2 sm:pb-3 border-b border-slate-200 text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 print:pb-1 print:text-[8px]">
                          <div className="col-span-6">{selectedInvoice?.isExpenseReport ? 'Item / Operative' : 'Description'}</div>
                          <div className="col-span-2 text-center">{selectedInvoice?.isExpenseReport ? 'Category' : 'Qty'}</div>
                          <div className="col-span-2 text-right">{selectedInvoice?.isExpenseReport ? 'Role / Type' : 'Rate'}</div>
                          <div className="col-span-2 text-right">{selectedInvoice?.isExpenseReport ? 'Cost' : 'Amount'}</div>
                        </div>
                        
                        <div className="space-y-2 mt-2 sm:mt-3 print:mt-2 print:space-y-0 text-slate-800">
                          {selectedInvoice?.isExpenseReport ? (
                             // Render Dynamic Expense Items
                             <>
                               {(selectedInvoice.allocations.length === 0 && selectedInvoice.project_expenses.length === 0) && (
                                  <p className="text-xs text-slate-400 italic px-2 py-4">No allocations or expenses logged for this project.</p>
                               )}

                               {/* Labor / Allocations */}
                               {selectedInvoice.allocations.map((a: any, i: number) => {
                                 const emp = employees.find(e => e.id === a.employee_id);
                                 const baseAlloc = parseFloat(a.allocated_amount || 0);
                                 const incAlloc = parseFloat(a.incentive_amount || 0);
                                 const lineVal = baseAlloc + incAlloc;
                                 return (
                                   <div key={`alloc-${i}`} className="grid grid-cols-12 gap-2 sm:gap-4 items-center print:break-inside-avoid py-1.5 px-2 border-b border-slate-50 last:border-0">
                                      <div className="col-span-6 text-[12px] sm:text-sm font-bold text-slate-700">
                                        {emp?.name || 'Unknown Employee'}
                                        {incAlloc > 0 && <span className="text-[10px] font-medium text-emerald-500 ml-2">(Inc. Bonus)</span>}
                                      </div>
                                      <div className="col-span-2 text-center text-[9px] sm:text-[10px] font-bold text-blue-600 bg-blue-50 py-0.5 rounded uppercase tracking-wider">Labor</div>
                                      <div className="col-span-2 text-right text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">{emp?.role || 'Staff'}</div>
                                      <div className="col-span-2 text-right font-black text-[12px] sm:text-[14px]">₹{lineVal.toLocaleString()}</div>
                                   </div>
                                 )
                               })}

                               {/* Additional Project Expenses */}
                               {selectedInvoice.project_expenses.map((e: any, i: number) => (
                                 <div key={`exp-${i}`} className="grid grid-cols-12 gap-2 sm:gap-4 items-center print:break-inside-avoid py-1.5 px-2 border-b border-slate-50 last:border-0">
                                    <div className="col-span-6 text-[12px] sm:text-sm font-bold text-slate-700 truncate pr-2">
                                      {e.description || e.expense_name || 'Project Expense'}
                                    </div>
                                    <div className="col-span-2 text-center text-[9px] sm:text-[10px] font-bold text-rose-600 bg-rose-50 py-0.5 rounded uppercase tracking-wider">Expense</div>
                                    <div className="col-span-2 text-right text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">{e.category || 'General'}</div>
                                    <div className="col-span-2 text-right font-black text-[12px] sm:text-[14px]">₹{parseFloat(e.amount || 0).toLocaleString()}</div>
                                 </div>
                               ))}
                             </>
                          ) : (
                             // Render Editable Admin Line Items
                             lineItems.map((item, index) => (
                               <div key={index} className="grid grid-cols-12 gap-2 sm:gap-4 items-center group print:break-inside-avoid print:py-1">
                                 <div className="col-span-6 relative">
                                   <input type="text" placeholder="Item description..." value={item.description} onChange={e => {const newItems=[...lineItems]; newItems[index].description = e.target.value; setLineItems(newItems)}} className="w-full h-10 sm:h-11 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 outline-none text-[12px] sm:text-[14px] font-medium transition-all px-2 print:hidden" />
                                   <span className="hidden print:block text-xs font-bold pl-2">{item.description || "-"}</span>
                                   {index > 0 && <button onClick={() => setLineItems(lineItems.filter((_, i) => i !== index))} className="absolute -left-6 top-2 sm:top-3 text-rose-300 hover:text-rose-500 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity print:hidden"><Trash2 className="h-3.5 w-3.5 sm:h-4 w-4" /></button>}
                                 </div>
                                 <div className="col-span-2">
                                    <input type="number" value={item.quantity} onChange={e => {const newItems=[...lineItems]; newItems[index].quantity = parseFloat(e.target.value)||0; setLineItems(newItems)}} className="w-full h-10 sm:h-11 bg-transparent text-center border-b border-transparent hover:border-slate-200 focus:border-blue-500 outline-none text-[12px] sm:text-[14px] font-bold transition-all print:hidden" />
                                    <span className="hidden print:block text-xs font-medium text-center">{item.quantity}</span>
                                 </div>
                                 <div className="col-span-2">
                                    <input type="number" value={item.rate} onChange={e => {const newItems=[...lineItems]; newItems[index].rate = parseFloat(e.target.value)||0; setLineItems(newItems)}} className="w-full h-10 sm:h-11 bg-transparent text-right border-b border-transparent hover:border-slate-200 focus:border-blue-500 outline-none text-[12px] sm:text-[14px] font-bold transition-all print:hidden" />
                                    <span className="hidden print:block text-xs font-medium text-right">₹{item.rate.toLocaleString()}</span>
                                 </div>
                                 <div className="col-span-2 text-right px-2 font-bold text-[12px] sm:text-[14px] print:text-xs">₹{(item.quantity * item.rate).toLocaleString()}</div>
                               </div>
                             ))
                          )}
                        </div>
                      </div>
                    </div>
                    {!selectedInvoice?.isExpenseReport && (
                       <button onClick={() => setLineItems([...lineItems, {description: "", quantity: 1, rate: 0}])} className="mt-3 sm:mt-4 text-[10px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-widest hover:bg-blue-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors print:hidden flex items-center"><Plus className="h-3 sm:h-3.5 w-3 sm:w-3.5 mr-1" /> Add Item</button>
                    )}
                  </div>

                  <div className="flex justify-end border-t border-slate-100 pt-5 sm:pt-6 print:pt-4 print:break-inside-avoid">
                    <div className="w-full max-w-sm space-y-3 sm:space-y-4 print:space-y-1.5">
                      <div className="flex justify-between items-center text-[12px] sm:text-sm font-bold text-slate-600 px-2 sm:px-4 print:px-2 print:text-xs"><span className="uppercase tracking-widest text-[9px] sm:text-[10px] print:text-[8px]">Subtotal</span><span>₹{subtotal.toLocaleString()}</span></div>
                      
                      {!selectedInvoice?.isExpenseReport && (
                         <>
                           <div className="flex justify-between items-center text-[12px] sm:text-sm font-bold text-slate-600 px-2 sm:px-4 print:px-2 print:text-xs">
                              <span className="uppercase tracking-widest text-[9px] sm:text-[10px] print:text-[8px] flex items-center gap-2">
                                Tax (%) 
                                <input type="number" value={formData.tax_rate} onChange={e => setFormData({...formData, tax_rate: parseFloat(e.target.value)||0})} className="w-12 sm:w-16 bg-slate-50 border border-slate-200 rounded p-1 text-center outline-none print:hidden" />
                                <span className="hidden print:inline text-slate-800">{formData.tax_rate}%</span>
                              </span>
                              <span>₹{taxAmount.toLocaleString()}</span>
                           </div>
                           <div className="flex justify-between items-center text-[12px] sm:text-sm font-bold text-slate-600 px-2 sm:px-4 print:px-2 print:text-xs">
                              <span className="uppercase tracking-widest text-[9px] sm:text-[10px] print:text-[8px] flex items-center gap-2">
                                Discount (₹) 
                                <input type="number" value={formData.discount_amount} onChange={e => setFormData({...formData, discount_amount: parseFloat(e.target.value)||0})} className="w-16 sm:w-24 bg-slate-50 border border-slate-200 rounded p-1 text-center outline-none text-rose-500 print:hidden" />
                                <span className="hidden print:inline text-rose-500">₹{formData.discount_amount.toLocaleString()}</span>
                              </span>
                              <span className="text-rose-500">- ₹{formData.discount_amount.toLocaleString()}</span>
                           </div>
                         </>
                      )}
                      <div className={`flex justify-between items-center text-[14px] sm:text-sm font-bold text-slate-600 px-2 sm:px-4 pt-3 sm:pt-4 border-t border-slate-100 print:px-2 print:pt-2 print:text-xs ${selectedInvoice?.isExpenseReport ? 'text-rose-600' : ''}`}>
                         <span className={`uppercase tracking-widest text-[10px] print:text-[8px] ${selectedInvoice?.isExpenseReport ? 'text-rose-600' : 'text-slate-800'}`}>
                            {selectedInvoice?.isExpenseReport ? 'Total Project Cost' : 'Grand Total'}
                         </span>
                         <span className={`${selectedInvoice?.isExpenseReport ? 'text-rose-600' : 'text-slate-900'} text-[16px] sm:text-base font-black`}>₹{grandTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Standard Client Invoice Ledger & Payment Recording */}
                  {selectedInvoice && !selectedInvoice.isExpenseReport && (
                    <div className="mt-8 sm:mt-12 border-t border-slate-100 pt-6 sm:pt-8 print:mt-6 print:pt-4 print:break-inside-avoid">
                      
                      {!showPaymentForm ? (
                        <button onClick={() => setShowPaymentForm(true)} className="mb-4 sm:mb-5 text-[10px] sm:text-[11px] font-bold text-emerald-600 uppercase tracking-widest hover:bg-emerald-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors print:hidden flex items-center"><Plus className="h-3 sm:h-3.5 w-3 sm:w-3.5 mr-1" /> Record New Payment</button>
                      ) : (
                        <div className="mb-4 sm:mb-5 p-4 sm:p-5 bg-white border border-emerald-100 rounded-xl sm:rounded-2xl shadow-sm print:hidden">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
                             <div><label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase block mb-1">Amount (₹)</label><input type="number" value={newPayment.amount} onChange={e => setNewPayment({...newPayment, amount: parseFloat(e.target.value) || 0})} className="w-full h-10 border border-slate-200 rounded-lg px-3 outline-none focus:border-emerald-500 font-bold text-[12px] sm:text-sm" /></div>
                             <div><label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase block mb-1">Date</label><input type="date" value={newPayment.payment_date} onChange={e => setNewPayment({...newPayment, payment_date: e.target.value})} className="w-full h-10 border border-slate-200 rounded-lg px-3 outline-none focus:border-emerald-500 font-medium text-[12px] sm:text-sm" /></div>
                             <div><label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase block mb-1">Method</label><select value={newPayment.payment_method} onChange={e => setNewPayment({...newPayment, payment_method: e.target.value})} className="w-full h-10 border border-slate-200 rounded-lg px-3 outline-none focus:border-emerald-500 font-medium text-[12px] sm:text-sm cursor-pointer"><option>Bank Transfer</option><option>Cash</option><option>Credit Card</option><option>UPI / Online</option></select></div>
                             <div><label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase block mb-1">Reference (Opt)</label><input type="text" value={newPayment.reference_note} onChange={e => setNewPayment({...newPayment, reference_note: e.target.value})} placeholder="Txn ID..." className="w-full h-10 border border-slate-200 rounded-lg px-3 outline-none focus:border-emerald-500 font-medium text-[12px] sm:text-sm" /></div>
                          </div>
                          <div className="flex justify-end gap-2">
                             <button onClick={() => setShowPaymentForm(false)} className="h-9 px-4 text-[11px] sm:text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg border border-slate-200">Cancel</button>
                             <button onClick={handleRecordPayment} disabled={isSaving} className="h-9 px-6 text-[11px] sm:text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm">Submit Payment</button>
                          </div>
                        </div>
                      )}

                      <h3 className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 sm:mb-4 print:text-[8px] print:mb-2">Transaction Ledger</h3>
                      
                      <div className="space-y-2 sm:space-y-3 print:space-y-1">
                        {currentInvoicePayments.length === 0 ? (
                          <p className="text-[12px] sm:text-sm text-slate-400 italic print:text-xs">No payments recorded.</p>
                        ) : (
                          currentInvoicePayments.map(payment => (
                            <div key={payment.id} className="flex justify-between items-center bg-slate-50 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-slate-100 print:bg-transparent print:border-none print:p-0 print:border-b print:border-slate-50 print:pb-1">
                              <div className="flex items-center gap-2 sm:gap-3 print:gap-2 min-w-0 pr-2">
                                 <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 print:hidden"><CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" /></div>
                                 <div className="min-w-0">
                                   <p className="text-[12px] sm:text-sm font-bold text-slate-900 print:text-xs truncate">{payment.payment_method}</p>
                                   <p className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-widest mt-0.5 print:text-[8px] truncate">{new Date(payment.payment_date).toLocaleDateString()} {payment.reference_note && `• Ref: ${payment.reference_note}`}</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                                <p className="text-[13px] sm:text-base font-bold text-emerald-600 print:text-xs">₹{parseFloat(payment.amount).toLocaleString()}</p>
                                <button onClick={() => handleDeletePayment(payment.id)} className="text-rose-400 hover:text-rose-600 print:hidden bg-rose-50 p-1.5 rounded-lg"><Trash2 className="h-3.5 w-3.5 sm:h-4 w-4" /></button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className={`flex justify-between items-center text-xl sm:text-2xl font-black text-slate-900 bg-slate-50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl mt-5 sm:mt-6 border border-slate-100 print:bg-transparent print:border-none print:px-2 print:py-2 print:mt-4 print:text-lg ${balanceDue <= 0 ? 'print:hidden' : ''}`}>
                         <span className="uppercase tracking-widest text-[10px] sm:text-[12px] print:text-[10px] text-slate-400">Balance Due</span>
                         <span>₹{balanceDue.toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  {/* Summary Block For Head Expense View */}
                  {selectedInvoice?.isExpenseReport && (
                     <div className="mt-8 sm:mt-12 border-t border-slate-100 pt-6 sm:pt-8 print:mt-6 print:pt-4 print:break-inside-avoid">
                        <div className="flex items-center justify-between p-4 sm:p-6 bg-rose-50/50 border border-rose-100 rounded-2xl">
                           <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Cleared</p>
                              <p className="text-lg font-black text-slate-800">₹{(selectedInvoice.amount_paid || 0).toLocaleString()}</p>
                           </div>
                           <ArrowRight className="h-4 w-4 text-slate-300 mx-4" />
                           <div className="text-right">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pending Labor Payouts</p>
                              <p className="text-lg font-black text-rose-600">₹{balanceDue.toLocaleString()}</p>
                           </div>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium italic mt-4 text-center">Cleared amount includes all recorded non-labor expenses and disbursed salaries. Pending funds represent allocated labor yet to be disbursed.</p>
                     </div>
                  )}

                </div>

                <div className="p-4 sm:p-6 border-t border-slate-100 bg-[#FAFCFF] flex justify-between items-center shrink-0 print:hidden pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {selectedInvoice && !selectedInvoice.isExpenseReport ? (
                    <div className="flex gap-2 sm:gap-3">
                      <button onClick={handleDeleteInvoice} className="border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 rounded-xl h-10 sm:h-12 px-4 sm:px-5 flex items-center justify-center shadow-sm transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ) : <div></div>}
                  
                  <div className="flex gap-2 sm:gap-3">
                    <button onClick={() => setIsModalOpen(false)} className="rounded-xl border border-slate-200 bg-white h-10 sm:h-12 px-4 sm:px-8 font-bold text-[12px] sm:text-sm text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">Close</button>
                    {!selectedInvoice?.isExpenseReport && (
                      <button onClick={handleSaveInvoice} disabled={isSaving} className="bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl h-10 sm:h-12 px-6 sm:px-10 font-bold text-[12px] sm:text-sm shadow-md shadow-blue-900/20 hover:shadow-lg hover:-translate-y-0.5 transition-all">
                        {isSaving ? "Saving..." : "Save Invoice"}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}