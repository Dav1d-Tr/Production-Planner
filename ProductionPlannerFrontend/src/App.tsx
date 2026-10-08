import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router";

import Home from "./Pages/Home";
import Planning from "./Pages/Planning";
import Coordinator from "./Pages/Coordinator";
import Priorities from "./Pages/Priorities";
import Responsables from "./Pages/ResponsablesPlanta";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* HOME */}
        <Route
          path="/"
          element={<Home />}
        />

        {/* También permitir /home */}
        <Route
          path="/home"
          element={<Home />}
        />

        {/* Programación */}
        <Route
          path="/programacion"
          element={<Planning />}
        />

        {/* Coordinador */}
        <Route
          path="/coordinador"
          element={<Coordinator />}
        />

        {/* Priorización de trabajos */}
        <Route
          path="/prioridades"
          element={<Priorities />}
        />

        <Route
          path="/Responsables"
          element={<Responsables />}
        />

        {/* Ruta inexistente */}
        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
