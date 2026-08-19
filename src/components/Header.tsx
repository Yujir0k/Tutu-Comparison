import { GitCompareArrows, Heart, Menu, UserRound } from "lucide-react";
import { TutuLogo } from "./TutuLogo";

interface HeaderProps {
  compareCount: number;
  onCompare: () => void;
}

export function Header({ compareCount, onCompare }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <button className="logo-button" type="button" aria-label="На главную">
          <TutuLogo />
        </button>

        <nav className="site-nav" aria-label="Основная навигация">
          <a href="https://www.tutu.ru/juicy-offers/">Это выгодно!</a>
          <a href="https://avto.tutu.ru/routes/">Автопутешествия</a>
          <a href="https://provereno.tutu.ru/">Маршруты</a>
          <a href="https://www.tutu.ru/2read/">Справочная</a>
          <a href="https://www.tutu.ru/geo/">Путеводитель</a>
        </nav>

        <div className="site-actions">
          <button className="header-link header-link--compare" type="button" aria-label="Открыть сравнение" onClick={onCompare}>
            <GitCompareArrows size={19} strokeWidth={2.4} />
            <span>Сравнение</span>
            {compareCount > 0 && <b>{compareCount}</b>}
          </button>
          <a className="header-link" href="https://favorites.tutu.ru/">
            <Heart size={18} fill="currentColor" />
            <span>Избранное</span>
          </a>
          <button className="login-button" type="button">
            <UserRound size={18} />
            Войти
          </button>
          <button className="menu-button" type="button" aria-label="Открыть меню">
            <Menu size={24} />
          </button>
        </div>
      </div>
    </header>
  );
}
