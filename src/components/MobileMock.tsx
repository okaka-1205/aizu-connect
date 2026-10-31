import { useState } from "react";
import "../styles/mobile-mock.css";

type MockScreen = "top" | "harvest" | "selection";

const menuItems = ["ToDo", "収穫", "選果", "追熟", "出荷"];

export function MobileMock() {
  const [screen, setScreen] = useState<MockScreen>("top");

  return (
    <div className="mobile-mock-page">
      <div className="mobile-mock-device">
        <header className="mobile-mock-header">
          <button
            className="mobile-mock-title-button"
            type="button"
            onClick={() => setScreen("top")}
          >
            {screen === "top" ? "TOP" : screen === "harvest" ? "収穫" : "選果"}
          </button>
        </header>

        {screen === "top" && (
          <main className="mobile-mock-panel mobile-mock-top-panel">
            {menuItems.map((item) => (
              <button
                className="mobile-mock-menu-card"
                key={item}
                type="button"
                onClick={() => {
                  if (item === "収穫") setScreen("harvest");
                  if (item === "選果") setScreen("selection");
                }}
              >
                {item}
              </button>
            ))}
          </main>
        )}

        {screen === "harvest" && (
          <main className="mobile-mock-panel mobile-mock-form-panel">
            <div className="mobile-mock-form-title">
              dd/mm/yyyy_品種番地名_樹体名
            </div>
            {["番地名", "樹体名", "品種名", "枝", "収穫量", "スタッフ名"].map(
              (item) => (
                <button
                  className="mobile-mock-form-card"
                  key={item}
                  type="button"
                >
                  {item}
                </button>
              ),
            )}
          </main>
        )}

        {screen === "selection" && (
          <main className="mobile-mock-panel mobile-mock-selection-panel">
            <section className="mobile-mock-section-card">
              <h2>収穫情報</h2>
              <div className="mobile-mock-info-main">収穫ID</div>
              <div className="mobile-mock-info-grid">
                <div>収穫日</div>
                <div>品種</div>
              </div>
            </section>

            <section className="mobile-mock-section-card mobile-mock-size-card">
              <h2>サイズ数量</h2>
              <div className="mobile-mock-before-harvest">選果前収穫量</div>
              <div className="mobile-mock-size-list">
                {["LL", "L", "M", "S"].map((size) => (
                  <div key={size}>
                    <span>{size}:</span>
                    <span>kg</span>
                  </div>
                ))}
                <div>
                  <span>ロス:</span>
                  <span>自動 kg</span>
                </div>
              </div>
            </section>
          </main>
        )}
      </div>
    </div>
  );
}
