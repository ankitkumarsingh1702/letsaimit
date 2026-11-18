import React from 'react';
import { useAdminAuth } from '../../context/AdminAuth.jsx';
import SignIn from '../../pages/SignIn.jsx';
import ProfileAvatar from '../../components/ProfileAvatar.jsx';
import WorkspaceSwitch from '../../components/WorkspaceSwitch.jsx';
import { mediaProps } from '../../lib/media.js';
import StudentsWorkspace from './StudentsWorkspace.jsx';
import '../admin/admin.css';
import './staff-tracker.css';

export function CoachingWorkspace({ auth }) {
  const students = React.useRef(null);
  return <div className="adm-app coaching-app">
    <aside className="adm-sidebar">
      <a className="adm-brand" href="/" aria-label="LetsAimIt home"><img {...mediaProps('logo.png', '110px')} alt="LetsAimIt" /></a>
      <p className="adm-sidebar-label">COACHING</p>
      <nav className="adm-nav" aria-label="Coaching navigation"><button type="button" aria-current="page" onClick={() => students.current?.showRoster()}>Students</button></nav>
      <div className="adm-utilities"><a href="/">Website</a><button type="button" onClick={() => { void auth.signOut(); }}>Sign out</button></div>
    </aside>
    <div className="adm-workspace">
      <header className="adm-topbar">
        <WorkspaceSwitch current="coach" canAdmin={auth.phase === 'authorized'} />
        <div className="adm-user"><ProfileAvatar name={auth.user.displayName || auth.user.email} src={auth.user.avatarUrl} /><span><strong>{auth.user.displayName || auth.user.email}</strong><span>{auth.user.email}</span></span></div>
      </header>
      <main className="adm-content"><StudentsWorkspace auth={auth} scope="coach" navigationRef={students} /></main>
    </div>
  </div>;
}

export default function StaffTracker() {
  const auth = useAdminAuth();
  if (['checking', 'signing_in', 'signing_out'].includes(auth.phase)) return <section className="coaching-gate" role="status"><h1>Students</h1><p>Checking your Google account…</p></section>;
  if (!auth.user?.isGoogle) return <SignIn mode="coach" />;
  return <CoachingWorkspace key={auth.user.id} auth={auth} />;
}
