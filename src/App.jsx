import TopBar from './components/TopBar';
import LeftPanel from './components/LeftPanel';
import CenterArea from './components/CenterArea';
import RightPanel from './components/RightPanel';
import Timeline from './components/Timeline';

export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-cb-dark">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <LeftPanel />
        <CenterArea />
        <RightPanel />
      </div>
      <Timeline />
    </div>
  );
}
