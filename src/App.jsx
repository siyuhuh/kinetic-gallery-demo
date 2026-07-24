import { NavLink, Route, Routes } from 'react-router-dom';
import GalleryPage from './pages/GalleryPage';
import CylinderPage from './pages/CylinderPage';
import styles from './App.module.scss';

export default function App() {
    return (
        <div className={styles.shell}>
            <header className={styles.header}>
                <span className={styles.logo}>Kinetic Gallery</span>
                <nav className={styles.nav} aria-label="Demo pages">
                    <NavLink
                        to="/"
                        end
                        className={({ isActive }) =>
                            `${styles.navLink}${isActive ? ` ${styles.navLinkActive}` : ''}`
                        }
                    >
                        Cards
                    </NavLink>
                    <NavLink
                        to="/cylinder"
                        className={({ isActive }) =>
                            `${styles.navLink}${isActive ? ` ${styles.navLinkActive}` : ''}`
                        }
                    >
                        Cylinder
                    </NavLink>
                </nav>
                <div className={styles.headerMeta}>
                    <a
                        className={styles.repoLink}
                        href="https://github.com/siyuhuh/kinetic-gallery-demo"
                        target="_blank"
                        rel="noreferrer"
                    >
                        GitHub
                    </a>
                </div>
            </header>

            <main className={styles.main}>
                <Routes>
                    <Route path="/" element={<GalleryPage />} />
                    <Route path="/cylinder" element={<CylinderPage />} />
                </Routes>
            </main>
        </div>
    );
}
