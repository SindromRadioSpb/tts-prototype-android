"""Independent kinematics residuals for the numerical errata; no provider calls."""
import json
import math
from pathlib import Path

checks = []
def check(page, name, values, residuals):
    assert all(abs(r) < 1e-8 for r in residuals), (page, name, residuals)
    checks.append(dict(page=page,check=name,values=values,residuals=residuals))

check(74,'Three consecutive stages',{'distance_m':4299},[49+4200+50-4299])
t = 7+300+50/7
stop_time = 50/7
runner_a = 2*(30-2*stop_time)/(stop_time**2)
check(75,'Travel time from stage distances',{'time_s':t,'runner_acceleration_m_s2':runner_a},
      [14*(t-7-50/7)+49+50-4299,2*stop_time+runner_a*stop_time**2/2-30])
v0 = 25/6
top = v0/10
rise = v0*top-5*top**2
entry = -math.sqrt(v0**2+100)
t_entry = (v0-entry)/10
second = (2+math.sqrt(104))/10
check(81,'Vertical trajectory with g=10',{'initial_speed_m_s':v0,'time_to_top_s':top,
      'rise_m':rise,'height_above_reference_m':5+rise,'entry_velocity_m_s':entry,
      'entry_time_s':t_entry,'second_trajectory_time_s':second},
      [v0-10*top,v0*t_entry-5*t_entry**2+5,entry-(v0-10*t_entry),5+2*second-5*second**2])
down = 8.66
t = (-down+math.sqrt(down**2+100))/10
check(85,'Downward launch, drop 5 m',{'flight_time_s':t,'delay_from_1s_s':1-t},[down*t+5*t*t-5])
out = Path(__file__).with_name('verified-dynamics.json')
out.write_text(json.dumps({'method':'independent equations and residuals','checks':checks},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(checks)} kinematics checks passed')
