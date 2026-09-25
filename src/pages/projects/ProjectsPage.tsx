import { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useDataStore } from "../../store/dataStore";

import StandardProjects from "./variants/StandardProjects";
import AcademyCourses from "./variants/AcademyCourses";
// import ConstructionSites from "./variants/ConstructionSites";

export default function ProjectsPage() {
  const { role, activeWorkspace, companyId } = useAuthStore();
  const { companies } = useDataStore();
  
  // We removed the slow React Router hack and replaced it with instantaneous state.
  const [targetProjectId, setTargetProjectId] = useState<number | null>(null);
  const [overrideCompanyId, setOverrideCompanyId] = useState<number | null>(null);

  // Function to instantly clear the override when the modal closes
  const handleClearOverride = () => {
    setTargetProjectId(null);
    setOverrideCompanyId(null);
  };

  // Function to instantly switch the view without touching the URL router
  const handleCrossHandoff = (projectId: number, compId: number) => {
    setTargetProjectId(projectId);
    setOverrideCompanyId(compId);
  };

  // 1. Determine which company we are currently viewing
  const effectiveCompanyId = overrideCompanyId || ((role === 'admin' || role === 'head') && activeWorkspace ? activeWorkspace : companyId);
  const currentCompany = companies.find((c: any) => c.id == effectiveCompanyId);

  // 2. Extract the business type (fallback to 'normal' if undefined)
  const businessType = currentCompany?.business_type || 'normal';

  // 3. The Strategy Pattern Router
  switch (businessType) {
    case 'academy':
      return (
        <AcademyCourses 
          autoOpenProjectId={targetProjectId} 
          forcedCompanyId={overrideCompanyId} 
          onClearOverride={handleClearOverride} 
          onCrossHandoff={handleCrossHandoff}
        />
      ); 
      
    case 'construction':
      return (
        <StandardProjects 
          autoOpenProjectId={targetProjectId} 
          forcedCompanyId={overrideCompanyId} 
          onClearOverride={handleClearOverride}
          onCrossHandoff={handleCrossHandoff} 
        />
      ); // Placeholder
      
    case 'normal':
    default:
      return (
        <StandardProjects 
          autoOpenProjectId={targetProjectId} 
          forcedCompanyId={overrideCompanyId} 
          onClearOverride={handleClearOverride} 
          onCrossHandoff={handleCrossHandoff}
        />
      );
  }
}