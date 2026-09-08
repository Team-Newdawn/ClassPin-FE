"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import type {ExperimentRun} from "./experiment-model";

export function useExperimentSelection(){
  const {id}=useParams<{id:string}>();
  const enabled=process.env.NODE_ENV==="development"&&id==="ef98fa52-d24a-4d37-88ba-f840a6a2b187";
  const [selected,setSelected]=useState("saved");
  const [runs,setRuns]=useState<ExperimentRun[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!enabled)return;
    const abort=new AbortController();
    fetch('/dev/model-benchmark/reports.json',{signal:abort.signal,cache:'no-store'}).then(async r=>{
      if(!r.ok)throw new Error();const data=await r.json();if(!Array.isArray(data.runs)||data.runs.some((v:ExperimentRun)=>!Array.isArray(v.records)))throw new Error();return data.runs as ExperimentRun[];
    }).then(setRuns).catch(()=>{if(!abort.signal.aborted)setError("실험 결과를 불러오지 못했습니다. 기존 리포트는 계속 볼 수 있습니다.");});
    return()=>abort.abort();
  },[enabled]);
  return {enabled,selected,setSelected,runs,error,run:enabled?runs.find(r=>r.id===selected):undefined};
}
