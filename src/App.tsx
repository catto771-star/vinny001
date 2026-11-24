import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { I18nProvider, useI18n } from "@/i18n";
import { Layout } from "@/components/Layout";
import { Notice } from "@/components/Notice";
import { ToastProvider } from "@/components/Toast";
import { Skeleton } from "@/components/Skeleton";
import { Absences } from "@/pages/Absences";
import { Audit } from "@/pages/Audit";
import { DailySheet } from "@/pages/DailySheet";
import { NoShows } from "@/pages/NoShows";
import { PrintSheet } from "@/pages/PrintSheet";
import { Seen } from "@/pages/Seen";
import { Handover } from "@/pages/Handover";
import { Maintenance } from "@/pages/Maintenance";
import { Deliveries } from "@/pages/Deliveries";
import { Dinner } from "@/pages/Dinner";
import { Fridge } from "@/pages/Fridge";
import { Laundry } from "@/pages/Laundry";
import { Notifications } from "@/pages/Notifications";
import { Warnings } from "@/pages/Warnings";
import { BedMap } from "@/pages/BedMap";
import { ChangePassword } from "@/pages/ChangePassword";
import { EmailCode } from "@/pages/EmailCode";
import { AuthCard, Login } from "@/pages/Login";
import { ResidentProfile } from "@/pages/ResidentProfile";
import { Residents } from "@/pages/Residents";
import { TakePost } from "@/pages/TakePost";
import { Today } from "@/pages/Today";
import { Users } from "@/pages/Users";
import { Distribution } from "@/pages/Distribution";
import { Hours } from "@/pages/Hours";
import { Purchases } from "@/pages/Purchases";
import { Reports } from "@/pages/Reports";
import { Rota } from "@/pages/Rota";
import { Vacations } from "@/pages/Vacations";

function Gate() {
  const { stage, isManagement, staff, post, signOut } = useAuth();
  const { t } = useI18n();

  switch (stage) {
    case "loading":
      return (
        <div className="center">
          <div style={{ width: "min(320px, 80vw)" }}>
            <Skeleton rows={3} label={t("app.loading")} />
          </div>
        </div>
      );
    case "signed_out":
      return <Login />;
    case "not_staff":
      return (
        <AuthCard title={t("auth.title")}>
          <Notice kind="error">{t("errors.notStaff")}</Notice>
          <button className="primary" onClick={() => void signOut()}>{t("auth.signOut")}</button>
        </AuthCard>
      );
    case "change_password":
      return <ChangePassword />;
    case "email_code":
      return <EmailCode />;
    case "ready":
      break;
  }

  // Porter sem posto vai direto para Assumir Posto (s.3, passo 1).
  const needsPost = staff?.role === "porter" && !post;

  return (
    <Routes>
      <Route path="/sheet/print" element={<PrintSheet />} />
      <Route path="/post" element={<Layout />}>
        <Route index element={<TakePost />} />
      </Route>
      <Route element={<Layout />}>
        <Route index element={needsPost ? <Navigate to="/post" replace /> : <Today />} />
        <Route path="residents" element={<Residents />} />
        <Route path="residents/:id" element={<ResidentProfile />} />
        <Route path="beds" element={<BedMap />} />
        <Route path="sheet" element={<DailySheet />} />
        <Route path="seen" element={<Seen />} />
        <Route path="absences" element={<Absences />} />
        <Route path="no-shows" element={<NoShows />} />
        <Route path="handover" element={<Handover />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="warnings" element={<Warnings />} />
        <Route path="fridge" element={<Fridge />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="dinner" element={<Dinner />} />
        <Route path="laundry" element={<Laundry />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="rota" element={<Rota />} />
        <Route path="distribution" element={<Distribution />} />
        {isManagement && <Route path="purchases" element={<Purchases />} />}
        {isManagement && <Route path="hours" element={<Hours />} />}
        {isManagement && <Route path="vacations" element={<Vacations />} />}
        {isManagement && <Route path="reports" element={<Reports />} />}
        {isManagement && <Route path="users" element={<Users />} />}
        {isManagement && <Route path="audit" element={<Audit />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Gate />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
