(function(global){
  "use strict";
  function parseBR(value){
    if(typeof value==="number") return Number.isFinite(value)?value:NaN;
    var s=String(value==null?"":value).trim().replace(/\s/g,"");
    if(!s) return NaN;
    if(!/^-?[\d.,]+$/.test(s)) return NaN;
    if(s.indexOf(",")>=0) s=s.replace(/\./g,"").replace(",",".");
    else {
      var dots=(s.match(/\./g)||[]).length;
      if(dots>1) s=s.replace(/\./g,"");
      else if(dots===1&&/^-?\d{1,3}\.\d{3}$/.test(s)) s=s.replace(".","");
    }
    return Number(s);
  }
  function money(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v)}
  function number(v,d){return new Intl.NumberFormat("pt-BR",{minimumFractionDigits:d||0,maximumFractionDigits:d==null?2:d}).format(v)}
  function percent(v){return number(v,2)+"%"}
  function toMeters(v,unit){return unit==="cm"?v/100:v}
  function packageVolume(p){return toMeters(p.length,p.unit)*toMeters(p.width,p.unit)*toMeters(p.height,p.unit)}
  function cubage(packages,realWeight,factor){
    var rows=packages.map(function(p){var unit=packageVolume(p);return Object.assign({},p,{unitVolume:unit,totalVolume:unit*p.quantity})});
    var totalVolume=rows.reduce(function(sum,p){return sum+p.totalVolume},0);
    var cubedWeight=totalVolume*factor,considered=Math.max(realWeight,cubedWeight);
    return {rows:rows,totalVolume:totalVolume,totalPackages:rows.reduce(function(s,p){return s+p.quantity},0),realWeight:realWeight,cubedWeight:cubedWeight,consideredWeight:considered,difference:Math.abs(cubedWeight-realWeight),differencePercent:realWeight?Math.abs(cubedWeight-realWeight)/realWeight*100:0};
  }
  function status(real,goal){var delta=real-goal;return delta<=0?"good":delta<=2?"attention":"critical"}
  function freight(order,freightValue,goal){
    var real=freightValue/order*100,max=order*goal/100,reduction=Math.max(0,freightValue-max);
    return {order:order,freight:freightValue,goal:goal,realPercent:real,maxFreight:max,differencePoints:real-goal,reduction:reduction,status:status(real,goal)};
  }
  function minimum(freightValue,goal,current){
    var min=freightValue/(goal/100),has=Number.isFinite(current),difference=has?min-current:NaN,currentPercent=has?freightValue/current*100:NaN;
    return {freight:freightValue,goal:goal,current:current,hasCurrent:has,minimum:min,difference:difference,additional:has?Math.max(0,difference):NaN,margin:has?Math.max(0,-difference):NaN,currentPercent:currentPercent,status:has?status(currentPercent,goal):"attention"};
  }
  function minimumAdvanced(freightValue,goal,operationalCost,grossMargin,current){
    var base=minimum(freightValue,goal,current);
    var hasCurrent=base.hasCurrent;
    var logisticsCost=freightValue+operationalCost;
    var logisticsPercent=hasCurrent?logisticsCost/current*100:NaN;
    var marginAfterLogistics=hasCurrent?grossMargin-logisticsPercent:NaN;
    var operationalPercent=hasCurrent?operationalCost/current*100:NaN;
    base.operationalCost=operationalCost;
    base.grossMargin=grossMargin;
    base.logisticsCost=logisticsCost;
    base.logisticsPercent=logisticsPercent;
    base.operationalPercent=operationalPercent;
    base.marginAfterLogistics=marginAfterLogistics;
    base.marginWarning=hasCurrent&&logisticsPercent>=grossMargin;
    if(base.marginWarning) base.status="critical";
    return base;
  }
  function accuracyByItems(total,correct){
    return {total:total,correct:correct,divergent:total-correct,accuracy:correct/total*100,divergence:(total-correct)/total*100};
  }
  function accuracyByQuantity(system,physical){
    var difference=physical-system,base=Math.max(Math.abs(system),Math.abs(physical));
    var divergence=base?Math.abs(difference)/base*100:0;
    return {system:system,physical:physical,difference:difference,absoluteDifference:Math.abs(difference),divergence:divergence,accuracy:Math.max(0,100-divergence)};
  }
  function accuracyByValue(system,physical){
    var result=accuracyByQuantity(system,physical);
    result.financialDifference=physical-system;
    return result;
  }
  function distributionCapacity(pallets,growth,occupancy,levels,pickingPositions){
    var growthPositions=pallets*(1+growth/100);
    var required=Math.ceil(growthPositions/(occupancy/100));
    var reserve=required-Math.ceil(growthPositions);
    var floorPositions=Math.ceil(required/levels);
    var pickingShare=required?pickingPositions/required*100:0;
    return {pallets:pallets,growth:growth,occupancy:occupancy,levels:levels,pickingPositions:pickingPositions,growthPositions:Math.ceil(growthPositions),requiredPositions:required,reservePositions:reserve,floorPositions:floorPositions,pickingShare:pickingShare};
  }
  function validPositive(value){return Number.isFinite(value)&&value>0}
  function validPercent(value){return validPositive(value)&&value<=100}
  function validQuantity(value){return validPositive(value)&&Number.isInteger(value)}
  global.JGM4Calc={parseBR:parseBR,money:money,number:number,percent:percent,toMeters:toMeters,packageVolume:packageVolume,cubage:cubage,freight:freight,minimum:minimum,minimumAdvanced:minimumAdvanced,accuracyByItems:accuracyByItems,accuracyByQuantity:accuracyByQuantity,accuracyByValue:accuracyByValue,distributionCapacity:distributionCapacity,status:status};
  global.JGM4Calc.validPositive=validPositive;
  global.JGM4Calc.validPercent=validPercent;
  global.JGM4Calc.validQuantity=validQuantity;
})(window);
