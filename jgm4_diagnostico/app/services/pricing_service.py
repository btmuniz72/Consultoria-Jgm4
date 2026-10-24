from dataclasses import dataclass
@dataclass
class PriceResult: home_total: float; external_total: float; subtotal: float; final_price: float
class PricingService:
    @staticmethod
    def calculate(home_hours, external_hours, home_rate, external_rate, expenses=0, discount=0, manual_adjustment=0):
        home_total = home_hours * home_rate; external_total = external_hours * external_rate; subtotal = home_total + external_total + expenses
        return PriceResult(home_total, external_total, subtotal, subtotal - discount + manual_adjustment)
