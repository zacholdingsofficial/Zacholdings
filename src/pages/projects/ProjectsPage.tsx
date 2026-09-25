import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useDataStore } from "../../store/dataStore";

// Import our UI variants
import StandardProjects from "./variants/StandardProjects";
import AcademyCourses from "./variants/AcademyCourses";
// import ConstructionSites from "./variants/ConstructionSites";

export default function ProjectsPage() {
  const { role, activeWorkspace, companyId } = useAuthStore();
  const { companies, projects } = useDataStore();
  
  const location = useLocation();
  const navigate = useNavigate();

  const [targetProjectId, setTargetProjectId] = useState<number | null>(null);
  const [overrideCompanyId, setOverrideCompanyId] = useState<number | null>(null);
  const [overrideType, setOverrideType] = useState<string | null>(null);

  useEffect(() => {
    if (location.state?.openProjectId) {
      setTargetProjectId(location.state.openProjectId);
      if (location.state.targetCompanyId) {
        setOverrideCompanyId(location.state.targetCompanyId);
      }
      if (location.state.targetProjectType) {
        setOverrideType(location.state.targetProjectType);
      }
      // Clear the router state immediately so refresh doesn't pop it open again
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  const effectiveCompanyId = overrideCompanyId || ((role === 'admin' || role === 'head') && activeWorkspace ? activeWorkspace : companyId);
  const currentCompany = companies.find((c: any) => c.id == effectiveCompanyId);

  let businessType = currentCompany?.business_type || 'normal';
  
  // Force the layout type if the router intercepted a specific project type
  if (overrideType === 'academy') {
    businessType = 'academy';
  } else if (targetProjectId && !overrideType) {
    const p = projects.find(proj => proj.id === targetProjectId);
    if (p && ['Course', 'Workshop', 'Internship'].includes(p.metadata?.type)) {
      businessType = 'academy';
    }
  }

  // The Strategy Pattern Router
  switch (businessType) {
    case 'academy':
      return <AcademyCourses autoOpenProjectId={targetProjectId} />; 
    case 'construction':
      return <StandardProjects autoOpenProjectId={targetProjectId} />; 
    case 'normal':
    default:
      return <StandardProjects autoOpenProjectId={targetProjectId} />;
  }
}